import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';

import type { Account, Attendee, CalendarEvent, CalendarMeta, RecurrenceEditScope } from '@/types';
import { useSettingsStore } from '@/stores/settingsStore';
import { useCalendarStore } from '@/stores/calendarStore';
import { getNativePickerLocale } from '@/utils/i18n';
import { resolveUse24h } from '@/utils/timeFormat';
import { eventToInput } from '@/features/calendar/utils/eventToInput';
import { resolveOrganizer } from '@/features/event/utils/organizer';
import { fetchFreeBusy } from '@/services/nextcloud/freeBusy';
import { mergeBusySlots, isSlotFree } from '@/utils/freeBusy';
import {
    useCreateEvent,
    useDeleteEvent,
    useUpdateEvent,
} from '@/features/event/hooks/useMutateEvent';
import {
    buildBriefing,
    buildReminderBriefing,
    briefingVoiceLocale,
} from '@/features/briefing/speechText';
import type { BriefingSegment } from '@/features/briefing/types';
import * as tts from '@/services/voice/tts';
import * as stt from '@/services/voice/stt';
import { parseUtterance, MUTATION_LIKE, type VoiceIntent } from '@/services/voice/intents';
import { decideMoveEventScope } from '@/features/calendar/utils/moveEventScope';
import { askAgent, isAgentAvailable, AgentError } from '@/services/voice/agent';
import {
    eventsOnDay,
    busyCalendarIds,
    findFreeSlots,
    type FreeSlot,
    nextEventAfter,
    findEventTargets,
    resolveAttendeeNames,
    inputFromCreateIntent,
    effectiveStart,
    movedDates,
} from '@/services/voice/actions';

export type VoiceState =
    | 'idle'
    | 'listening'
    | 'parsed'
    | 'confirming'
    | 'disambiguating'
    | 'executing'
    | 'thinking'
    | 'replying'
    | 'error';

type PendingOp =
    | { kind: 'create'; input: ReturnType<typeof inputFromCreateIntent> }
    | { kind: 'move'; event: CalendarEvent; dtstart: Date; dtend: Date; scope?: RecurrenceEditScope }
    | { kind: 'delete'; event: CalendarEvent; scope?: RecurrenceEditScope }
    | { kind: 'agent'; text: string };

// after a spoken reply completes, the sheet stays up this long for reading,
// then closes itself — cancelled by any new interaction.
const AUTO_CLOSE_DELAY_MS = 4000;

function intentTargetTitle(intent: VoiceIntent): string | undefined {
    return intent.kind === 'move' || intent.kind === 'delete' ? intent.target.title : undefined;
}

export interface VoiceAssistant {
    visible: boolean;
    state: VoiceState;
    transcript: string;
    intentDescription?: string;
    candidates: string[];
    reply?: string;
    errorText?: string;
    open: () => void;
    close: () => void;
    submitText: (text: string) => void;
    confirm: () => void;
    pickCandidate: (index: number) => void;
    relisten: () => void;
}

export function useVoiceAssistant(account: Account | null, calendars: CalendarMeta[]): VoiceAssistant {
    const { t, i18n } = useTranslation();
    const language = useSettingsStore((s) => s.language);
    const timeFormat = useSettingsStore((s) => s.timeFormat);

    const [visible, setVisible] = useState(false);
    const [state, setState] = useState<VoiceState>('idle');
    const [transcript, setTranscript] = useState('');
    const [intentDescription, setIntentDescription] = useState<string>();
    const [candidates, setCandidates] = useState<string[]>([]);
    const [reply, setReply] = useState<string>();
    const [errorText, setErrorText] = useState<string>();

    const genRef = useRef(0);
    const stateRef = useRef<VoiceState>('idle');
    const pendingRef = useRef<PendingOp | null>(null);
    const candidateEventsRef = useRef<CalendarEvent[]>([]);
    const candidateCalendarsRef = useRef<CalendarMeta[]>([]);
    const pendingSlotsRef = useRef<FreeSlot[]>([]);
    const altSlotCreateRef = useRef<{
        intent: Extract<VoiceIntent, { kind: 'create' }>;
        calendar: CalendarMeta;
        attendees: Attendee[];
        slots: FreeSlot[];
        notes: string;
    } | null>(null);
    const preResolvedAttendeesRef = useRef<{ attendees: Attendee[]; dropped: string[] } | null>(null);
    const pendingAttendeesRef = useRef<Attendee[]>([]);
    const pendingNotesRef = useRef('');
    const pendingIntentRef = useRef<VoiceIntent | null>(null);
    const scopePickRef = useRef<{ event: CalendarEvent; intent: VoiceIntent } | null>(null);
    const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const closeRef = useRef<(() => void) | undefined>(undefined);
    const abortRef = useRef<AbortController | null>(null);

    const createEvent = useCreateEvent(account!, calendars);
    const updateEvent = useUpdateEvent(account!, calendars);
    const deleteEvent = useDeleteEvent(account!);

    const setStatus = useCallback((s: VoiceState) => {
        stateRef.current = s;
        setState(s);
    }, []);

    const locale = useCallback(() => {
        const l = getNativePickerLocale(language);
        return { locale: l, voice: briefingVoiceLocale(l), use24h: resolveUse24h(timeFormat, l) };
    }, [language, timeFormat]);

    const cancelAutoClose = useCallback(() => {
        if (autoCloseRef.current) {
            clearTimeout(autoCloseRef.current);
            autoCloseRef.current = null;
        }
    }, []);

    const scheduleAutoClose = useCallback(
        (gen: number) => {
            cancelAutoClose();
            autoCloseRef.current = setTimeout(() => {
                autoCloseRef.current = null;
                if (genRef.current === gen && stateRef.current === 'replying') closeRef.current?.();
            }, AUTO_CLOSE_DELAY_MS);
        },
        [cancelAutoClose],
    );

    // --- TTS chain (same gen-guard pattern as useBriefing) ---
    const speakSegments = useCallback(
        (segs: BriefingSegment[], gen: number, voice: string, onAllDone?: () => void) => {
            const speakAt = (i: number) => {
                if (genRef.current !== gen || i >= segs.length) {
                    if (i >= segs.length) onAllDone?.();
                    return;
                }
                tts.speak(segs[i].text, {
                    language: voice,
                    onDone: () => speakAt(i + 1),
                    onError: () => speakAt(i + 1),
                });
            };
            speakAt(0);
        },
        [],
    );

    const say = useCallback(
        (text: string, gen: number, voice: string, onDone?: () => void) => {
            tts.speak(text, { language: voice, onDone, onError: onDone });
        },
        [],
    );

    // every interactive state (question, confirmation card, error) is spoken,
    // not just shown — a voice assistant must answer with its voice.
    const promptWith = useCallback(
        (text: string, s: 'confirming' | 'disambiguating' | 'error', gen?: number) => {
            const g = gen ?? genRef.current;
            const { voice } = locale();
            if (s === 'error') setErrorText(text);
            else setIntentDescription(text);
            setStatus(s);
            if (text) say(text, g, voice);
        },
        [locale, say, setStatus],
    );

    const replyWith = useCallback(
        (text: string, opts?: { segs?: BriefingSegment[] }) => {
            const gen = genRef.current;
            const { voice } = locale();
            setReply(text);
            setIntentDescription(undefined);
            setCandidates([]);
            setStatus('replying');
            const done = () => scheduleAutoClose(gen);
            if (opts?.segs?.length) speakSegments(opts.segs, gen, voice, done);
            else if (text) say(text, gen, voice, done);
            else done();
        },
        [locale, speakSegments, say, setStatus, scheduleAutoClose],
    );

    // --- intent description shown on the confirmation card ---
    const describeIntent = useCallback(
        (intent: VoiceIntent, opts: { calendarName?: string; resolvedTitle?: string } = {}): string => {
            const l = getNativePickerLocale(language);
            const fmt = (d: Date) => dayjs(d).locale(l).format('dddd D MMMM · HH:mm');
            const targetTitle = opts.resolvedTitle || intentTargetTitle(intent) || t('voice.untitled');
            switch (intent.kind) {
                case 'create':
                    return t('voice.confirmCreate', {
                        title: intent.summary?.trim() || t('voice.untitled'),
                        when: fmt(effectiveStart(intent)),
                        calendar: opts.calendarName ?? '',
                    });
                case 'move':
                    return t('voice.confirmMove', {
                        title: targetTitle,
                        when:
                            intent.newStartHasTime === false
                                ? dayjs(intent.newStart).locale(l).format('dddd D MMMM')
                                : fmt(intent.newStart),
                    });
                case 'delete':
                    return t('voice.confirmDelete', { title: targetTitle });
                default:
                    return '';
            }
        },
        [language, t],
    );

    // Arms the create confirmation card for a chosen calendar. Warns (without
    // blocking) when a resolved attendee is busy on the requested slot —
    // explicit-time creates never reach the 'slot' intent's free/busy merge.
    // Shared by the direct path and the calendar-disambiguation pick.
    const armCreate = useCallback(
        async (
            intent: Extract<VoiceIntent, { kind: 'create' }>,
            calendar: CalendarMeta,
            attendees: Attendee[],
            gen: number,
        ) => {
            if (!account) return;
            const organizer = resolveOrganizer(account);
            const input = inputFromCreateIntent(intent, {
                calendarId: calendar.id,
                ...organizer,
                attendees,
            });
            if (attendees.length) {
                try {
                    // One VFREEBUSY over the requested day + 4 more — if the
                    // requested slot is busy, alternatives on later days are
                    // covered without a second round trip.
                    const fbStart = dayjs(input.dtstart).startOf('day').toDate();
                    const fbEnd = dayjs(input.dtstart).add(4, 'day').endOf('day').toDate();
                    const avail = await fetchFreeBusy(
                        account,
                        { email: organizer.organizerEmail, displayName: organizer.organizerName },
                        attendees,
                        fbStart,
                        fbEnd,
                    );
                    if (genRef.current !== gen) return;
                    const busy = avail.filter(
                        (a) => !isSlotFree({ start: input.dtstart, end: input.dtend }, a.slots),
                    );
                    if (busy.length) {
                        // Offer free alternative slots — same rules as the
                        // 'slot' intent (own blocking calendars + attendee
                        // free/busy merged), probing the requested day then
                        // the next ones when it is fully booked.
                        const busyIds = busyCalendarIds(
                            calendars,
                            useCalendarStore.getState().availabilityCalendarOverrides,
                        );
                        const fbBusy = mergeBusySlots(avail).map(
                            (b) =>
                                ({
                                    dtstart: b.start, dtend: b.end, allDay: false, isTask: false,
                                    calendarId: '__freebusy__',
                                }) as CalendarEvent,
                        );
                        const durationMin = Math.max(
                            1,
                            Math.round((input.dtend.getTime() - input.dtstart.getTime()) / 60000),
                        );
                        const slots: FreeSlot[] = [];
                        for (let off = 0; off <= 4 && slots.length < 3; off++) {
                            const day = dayjs(input.dtstart).add(off, 'day').toDate();
                            const events = await eventsOnDay(account.id, day);
                            if (genRef.current !== gen) return;
                            const busyEvents = [
                                ...fbBusy,
                                ...events.filter((e) => busyIds.has(e.calendarId)),
                            ];
                            for (const s of findFreeSlots(busyEvents, day, {
                                durationMin,
                                minStart: off === 0 ? input.dtstart : undefined,
                            })) {
                                slots.push(s);
                                if (slots.length >= 6) break;
                            }
                        }
                        slots.length = Math.min(slots.length, 6);
                        if (slots.length) {
                            const { locale: loc } = locale();
                            altSlotCreateRef.current = {
                                intent,
                                calendar,
                                attendees,
                                slots,
                                notes: pendingNotesRef.current,
                            };
                            pendingNotesRef.current = '';
                            const fmtT = (d: Date) => dayjs(d).locale(loc).format('HH:mm');
                            const fmtD = (d: Date) => dayjs(d).locale(loc).format('dd DD/MM');
                            setCandidates(
                                slots.map((s) =>
                                    dayjs(s.start).isSame(input.dtstart, 'day')
                                        ? `${fmtT(s.start)} – ${fmtT(s.end)}`
                                        : `${fmtD(s.start)} ${fmtT(s.start)} – ${fmtT(s.end)}`,
                                ),
                            );
                            promptWith(
                                describeIntent(intent, { calendarName: calendar.displayName }) +
                                    altSlotCreateRef.current.notes +
                                    ` — ${t('voice.attendeesBusy', {
                                        names: busy.map((a) => a.displayName || a.email).join(', '),
                                    })} ${t('voice.pickAltSlot')}`,
                                'disambiguating',
                                gen,
                            );
                            return;
                        }
                        pendingNotesRef.current += ` — ${t('voice.attendeesBusy', {
                            names: busy.map((a) => a.displayName || a.email).join(', '),
                        })}`;
                    }
                } catch {
                    // free/busy unreachable → confirm without the warning
                }
            }

            pendingRef.current = { kind: 'create', input };
            promptWith(describeIntent(intent, { calendarName: calendar.displayName }) + pendingNotesRef.current, 'confirming', gen);
            pendingNotesRef.current = '';
        },
        [account, calendars, describeIntent, locale, promptWith, t],
    );

    // --- create path shared by 'create' and 'slot' intents: resolves attendees,
    // the target calendar (spoken name → configured default → ask), then arms
    // the confirmation card ---
    const routeCreate = useCallback(
        async (intent: Extract<VoiceIntent, { kind: 'create' }>, gen: number) => {
            if (!account) return;
            const names = intent.names ?? [];
            let attendees = [] as Awaited<ReturnType<typeof resolveAttendeeNames>>['attendees'];
            let dropped: string[] = [];
            if (preResolvedAttendeesRef.current) {
                attendees = preResolvedAttendeesRef.current.attendees;
                dropped = preResolvedAttendeesRef.current.dropped;
                preResolvedAttendeesRef.current = null;
            } else if (names.length) {
                const resolved = await resolveAttendeeNames(account, names);
                attendees = resolved.attendees;
                dropped = resolved.ambiguous;
            }
            if (genRef.current !== gen) return;
            const withNote = attendees.length
                ? ` — ${t('voice.withAttendees', { names: attendees.map((a) => a.displayName || a.email).join(', ') })}`
                : '';
            const droppedNote = dropped.length
                ? ` — ${t('voice.attendeesDropped', { names: dropped.join(', ') })}`
                : '';
            pendingNotesRef.current = withNote + droppedNote;

            const writable = calendars.filter((c) => !c.isReadOnly);
            if (!writable.length) {
                promptWith(t('voice.noWritableCalendar'), 'error', gen);
                return;
            }
            const fold = (s: string) =>
                s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
            const askCalendar = (pool: CalendarMeta[]) => {
                pendingIntentRef.current = intent;
                pendingAttendeesRef.current = attendees;
                candidateCalendarsRef.current = pool;
                setCandidates(pool.slice(0, 6).map((c) => c.displayName));
                promptWith(t('voice.whichCalendar'), 'disambiguating', gen);
            };
            let calendar: CalendarMeta | undefined;
            if (intent.calendarName?.trim()) {
                const n = fold(intent.calendarName);
                const matches = writable.filter(
                    (c) => fold(c.displayName).includes(n) || n.includes(fold(c.displayName)),
                );
                if (matches.length === 1) calendar = matches[0];
                else {
                    askCalendar(matches.length > 1 ? matches : writable);
                    return;
                }
            }
            if (!calendar) {
                const defId = useSettingsStore.getState().defaultCalendarByAccount[account.id];
                calendar =
                    writable.find((c) => c.id === defId) ??
                    (writable.length === 1 ? writable[0] : undefined);
            }
            if (!calendar) {
                askCalendar(writable);
                return;
            }

            pendingIntentRef.current = intent;
            await armCreate(intent, calendar, attendees, gen);
        },
        [account, calendars, describeIntent, promptWith, t, armCreate],
    );

    // --- move/delete arming: a day-only destination keeps the event's clock
    // time; a recurring match asks for the edit scope before confirming ---
    const moveTargetDates = useCallback(
        (event: CalendarEvent, intent: Extract<VoiceIntent, { kind: 'move' }>) => {
            const dest = intent.newStart;
            const start =
                intent.newStartHasTime === false
                    ? new Date(
                          dest.getFullYear(),
                          dest.getMonth(),
                          dest.getDate(),
                          new Date(event.dtstart).getHours(),
                          new Date(event.dtstart).getMinutes(),
                          new Date(event.dtstart).getSeconds(),
                          new Date(event.dtstart).getMilliseconds(),
                      )
                    : dest;
            return movedDates(event, start);
        },
        [],
    );

    const armTarget = useCallback(
        (event: CalendarEvent, intent: VoiceIntent, scope?: RecurrenceEditScope) => {
            if (intent.kind !== 'move' && intent.kind !== 'delete') return;
            pendingRef.current =
                intent.kind === 'move'
                    ? { kind: 'move', event, scope, ...moveTargetDates(event, intent) }
                    : { kind: 'delete', event, scope };
            promptWith(describeIntent(intent, { resolvedTitle: event.summary }), 'confirming');
        },
        [describeIntent, moveTargetDates, promptWith],
    );

    const armWithScopeDecision = useCallback(
        (event: CalendarEvent, intent: VoiceIntent) => {
            if (intent.kind !== 'move' && intent.kind !== 'delete') return;
            const decision = decideMoveEventScope(event);
            if (decision.kind === 'prompt') {
                // one voice command must not silently rewrite a whole series —
                // ask for the scope, then land on the confirmation card.
                scopePickRef.current = { event, intent };
                candidateEventsRef.current = [];
                pendingIntentRef.current = intent;
                setCandidates([
                    t('event.scopeThisOnly'),
                    t('event.scopeThisAndFollowingBtn'),
                    t('event.scopeAllEvents'),
                ]);
                promptWith(t('event.recurrenceScopeMessage'), 'disambiguating');
                return;
            }
            armTarget(event, intent, decision.scope);
        },
        [armTarget, promptWith, t],
    );

    // --- routing ---
    const routeIntent = useCallback(
        async (intent: VoiceIntent, gen: number) => {
            if (!account) return;
            const { locale: loc, use24h } = locale();
            setStatus('executing');
            try {
                switch (intent.kind) {
                    case 'agenda': {
                        const events = await eventsOnDay(account.id, intent.day);
                        if (genRef.current !== gen) return;
                        const segs = buildBriefing(events, { locale: loc, use24h, day: intent.day });
                        if (!segs.length) {
                            replyWith(t('voice.nothingOnDay', { date: dayjs(intent.day).locale(loc).format('dddd D MMMM') }));
                            return;
                        }
                        replyWith(segs.map((s) => s.text).join(' '), { segs });
                        return;
                    }
                    case 'next': {
                        const event = await nextEventAfter(account.id);
                        if (genRef.current !== gen) return;
                        if (!event) {
                            replyWith(t('voice.nothingFound'));
                            return;
                        }
                        const sameDay = (await eventsOnDay(account.id, event.dtstart)).filter(
                            (e) => e.uid !== event.uid && new Date(e.dtstart).getTime() > new Date(event.dtstart).getTime(),
                        );
                        const segs = buildReminderBriefing(event, sameDay, { locale: loc, use24h });
                        replyWith(segs.map((s) => s.text).join(' '), { segs });
                        return;
                    }
                    case 'create':
                        return routeCreate(intent, gen);
                    case 'slot': {
                        const events = await eventsOnDay(account.id, intent.day);
                        if (genRef.current !== gen) return;
                        const busyIds = busyCalendarIds(
                            calendars,
                            useCalendarStore.getState().availabilityCalendarOverrides,
                        );
                        const busyEvents = events.filter((e) => busyIds.has(e.calendarId));
                        // Resolve named attendees first: a good slot is free for them too.
                        let attendees: Attendee[] = [];
                        if (intent.names?.length) {
                            const resolved = await resolveAttendeeNames(account, intent.names);
                            if (genRef.current !== gen) return;
                            attendees = resolved.attendees;
                            preResolvedAttendeesRef.current = { attendees, dropped: resolved.ambiguous };
                        }
                        if (attendees.length) {
                            try {
                                const { organizerEmail, organizerName } = resolveOrganizer(account);
                                const organizer: Attendee = { email: organizerEmail, displayName: organizerName };
                                const day0 = dayjs(intent.day).startOf('day').toDate();
                                const day1 = dayjs(intent.day).endOf('day').toDate();
                                const avail = await fetchFreeBusy(account, organizer, attendees, day0, day1);
                                if (genRef.current !== gen) return;
                                for (const b of mergeBusySlots(avail)) {
                                    busyEvents.push({
                                        dtstart: b.start, dtend: b.end, allDay: false, isTask: false,
                                        calendarId: '__freebusy__',
                                    } as CalendarEvent);
                                }
                            } catch {
                                // free/busy unreachable → propose on own calendars only
                            }
                        }
                        const now = new Date();
                        const slots = findFreeSlots(busyEvents, intent.day, {
                            durationMin: intent.durationMin,
                            minStart: dayjs(intent.day).isSame(now, 'day') ? now : undefined,
                        });
                        const date = dayjs(intent.day).locale(loc).format('dddd D MMMM');
                        if (!slots.length) {
                            promptWith(t('voice.noFreeSlot', { date }), 'error', gen);
                            return;
                        }
                        pendingSlotsRef.current = slots;
                        pendingIntentRef.current = intent;
                        const fmtT = (d: Date) => dayjs(d).locale(loc).format('HH:mm');
                        setCandidates(slots.map((s) => `${fmtT(s.start)} – ${fmtT(s.end)}`));
                        promptWith(t('voice.whichSlot', { date }), 'disambiguating', gen);
                        return;
                    }
                    case 'move':
                    case 'delete': {
                        const matches = await findEventTargets(account.id, intent.target);
                        if (genRef.current !== gen) return;
                        if (!matches.length) {
                            replyWith(t('voice.nothingFound'));
                            return;
                        }
                        if (matches.length > 1) {
                            candidateEventsRef.current = matches;
                            pendingIntentRef.current = intent;
                            setCandidates(
                                matches.slice(0, 5).map(
                                    (e) =>
                                        `${e.summary || t('voice.untitled')} · ${dayjs(e.dtstart)
                                            .locale(loc)
                                            .format('dd DD/MM HH:mm')}`,
                                ),
                            );
                            promptWith(t('voice.whichEvent'), 'disambiguating', gen);
                            return;
                        }
                        const event = matches[0];
                        armWithScopeDecision(event, intent);
                        return;
                    }
                    case 'freeform': {
                        const available = account ? await isAgentAvailable(account) : false;
                        if (genRef.current !== gen) return;
                        if (!available) {
                            replyWith(t('voice.notUnderstood'));
                            return;
                        }
                        if (MUTATION_LIKE.test(intent.text)) {
                            // the context agent can mutate the calendar
                            // server-side — gate it behind the same explicit
                            // confirmation as local mutations.
                            pendingRef.current = { kind: 'agent', text: intent.text };
                            pendingIntentRef.current = intent;
                            promptWith(t('voice.confirmAgent'), 'confirming', gen);
                            return;
                        }
                        setStatus('thinking');
                        const ctrl = new AbortController();
                        abortRef.current = ctrl;
                        try {
                            const answer = await askAgent(account, intent.text, { signal: ctrl.signal });
                            if (genRef.current !== gen) return;
                            replyWith(answer);
                        } catch (e) {
                            if (genRef.current !== gen) return;
                            const reason = e instanceof AgentError ? e.reason : 'failed';
                            replyWith(
                                reason === 'timeout'
                                    ? t('voice.stillThinking')
                                    : reason === 'cooldown' || reason === 'unavailable'
                                      ? t('voice.notUnderstood')
                                      : t('voice.serverError'),
                            );
                        }
                        return;
                    }
                    case 'unknown':
                    default:
                        replyWith(t('voice.notUnderstood'));
                }
            } catch (e) {
                if (__DEV__) console.warn('[voice] intent failed', e);
                if (genRef.current === gen) {
                    promptWith(t('voice.serverError'), 'error', gen);
                }
            }
        },
        [account, calendars, locale, describeIntent, replyWith, setStatus, armWithScopeDecision, promptWith, t],
    );

    const handleUtterance = useCallback(
        (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) return;
            // a new utterance always starts a fresh round — drop any pending op
            genRef.current += 1;
            const gen = genRef.current;
            cancelAutoClose();
            pendingRef.current = null;
            pendingIntentRef.current = null;
            scopePickRef.current = null;
            candidateEventsRef.current = [];
            candidateCalendarsRef.current = [];
            pendingAttendeesRef.current = [];
            pendingNotesRef.current = '';
            pendingSlotsRef.current = [];
            altSlotCreateRef.current = null;
            preResolvedAttendeesRef.current = null;
            setCandidates([]);
            setTranscript(trimmed);
            setReply(undefined);
            setStatus('parsed');
            void routeIntent(parseUtterance(trimmed, { locale: getNativePickerLocale(language) }), gen);
        },
        [language, routeIntent, setStatus, cancelAutoClose],
    );

    const listen = useCallback(async () => {
        const { locale: loc } = locale();
        const gen = genRef.current;
        setTranscript('');
        setReply(undefined);
        if (!stt.isSttAvailable()) {
            promptWith(t('voice.sttUnavailable'), 'error', gen);
            return;
        }
        const granted = await stt.requestSttPermissions();
        if (genRef.current !== gen) return;
        if (!granted) {
            promptWith(t('voice.permissionDenied'), 'error', gen);
            return;
        }
        setStatus('listening');
        // on-device STT when preferred AND supported — else network fallback.
        const onDevice =
            useSettingsStore.getState().voiceOnDevicePreferred && stt.supportsOnDeviceRecognition();
        stt.startListening({
            locale: loc,
            onDevice,
            onPartial: (text) => {
                if (genRef.current === gen) setTranscript(text);
            },
            onResult: (text) => {
                if (genRef.current === gen) handleUtterance(text);
            },
            onError: () => {
                if (genRef.current !== gen) return;
                promptWith(t('voice.sttUnavailable'), 'error', gen);
            },
        });
    }, [handleUtterance, locale, setStatus, promptWith, t]);

    const open = useCallback(() => {
        genRef.current += 1;
        cancelAutoClose();
        setVisible(true);
        setTranscript('');
        setReply(undefined);
        setIntentDescription(undefined);
        setCandidates([]);
        setErrorText(undefined);
        void listen();
    }, [listen, cancelAutoClose]);

    const close = useCallback(() => {
        genRef.current += 1;
        cancelAutoClose();
        abortRef.current?.abort();
        abortRef.current = null;
        stt.cancelListening();
        tts.stop();
        pendingRef.current = null;
        scopePickRef.current = null;
        candidateEventsRef.current = [];
        candidateCalendarsRef.current = [];
        pendingAttendeesRef.current = [];
        pendingNotesRef.current = '';
        pendingSlotsRef.current = [];
        altSlotCreateRef.current = null;
        preResolvedAttendeesRef.current = null;
        pendingIntentRef.current = null;
        setVisible(false);
        setStatus('idle');
    }, [setStatus, cancelAutoClose]);

    const submitText = useCallback(
        (text: string) => {
            genRef.current += 1; // cancel any in-flight STT/agent round
            stt.cancelListening();
            abortRef.current?.abort();
            handleUtterance(text);
        },
        [handleUtterance],
    );

    const relisten = useCallback(() => {
        genRef.current += 1;
        cancelAutoClose();
        pendingRef.current = null;
        pendingIntentRef.current = null;
        scopePickRef.current = null;
        candidateEventsRef.current = [];
        candidateCalendarsRef.current = [];
        pendingAttendeesRef.current = [];
        pendingNotesRef.current = '';
        pendingSlotsRef.current = [];
        altSlotCreateRef.current = null;
        preResolvedAttendeesRef.current = null;
        setCandidates([]);
        stt.cancelListening();
        abortRef.current?.abort();
        tts.stop();
        void listen();
    }, [listen, cancelAutoClose]);

    const confirm = useCallback(async () => {
        const op = pendingRef.current;
        if (!account || !op) return;
        const gen = genRef.current;
        cancelAutoClose();
        setStatus('executing');
        if (op.kind === 'agent') {
            pendingRef.current = null;
            pendingIntentRef.current = null;
            setIntentDescription('');
            setStatus('thinking');
            try {
                const answer = await askAgent(account, op.text);
                if (genRef.current !== gen) return;
                replyWith(answer);
            } catch (e) {
                if (genRef.current !== gen) return;
                const key =
                    e instanceof AgentError
                        ? e.reason === 'timeout'
                            ? 'voice.stillThinking'
                            : 'voice.agentUnavailable'
                        : 'voice.serverError';
                replyWith(t(key));
            }
            return;
        }
        try {
            const result =
                op.kind === 'create'
                    ? await createEvent.mutateAsync(op.input)
                    : op.kind === 'move'
                      ? await updateEvent.mutateAsync({
                            event: op.event,
                            input: { ...eventToInput(op.event, account), dtstart: op.dtstart, dtend: op.dtend },
                            scope: op.scope,
                            datesOnly: true,
                        })
                      : await deleteEvent.mutateAsync({ event: op.event, scope: op.scope });
            if (genRef.current !== gen) return;
            pendingRef.current = null;
            pendingIntentRef.current = null;
            if (result === 'failed') {
                promptWith(t('voice.serverError'), 'error', gen);
                return;
            }
            replyWith(
                result === 'queued'
                    ? t(op.kind === 'delete' ? 'event.deleteQueued' : 'event.createQueued')
                    : t(op.kind === 'create' ? 'voice.created' : op.kind === 'move' ? 'voice.moved' : 'voice.deleted'),
            );
        } catch (e) {
            if (__DEV__) console.warn('[voice] mutation failed', e);
            if (genRef.current === gen) {
                promptWith(t('voice.serverError'), 'error', gen);
            }
        }
    }, [account, createEvent, updateEvent, deleteEvent, replyWith, setStatus, cancelAutoClose, promptWith, t]);

    const pickCandidate = useCallback(
        (index: number) => {
            cancelAutoClose();
            const altCreate = altSlotCreateRef.current;
            if (altCreate) {
                altSlotCreateRef.current = null;
                const slot = altCreate.slots[index];
                setCandidates([]);
                if (!slot) return;
                pendingNotesRef.current = altCreate.notes;
                void armCreate(
                    { ...altCreate.intent, start: slot.start, end: slot.end },
                    altCreate.calendar,
                    altCreate.attendees,
                    genRef.current,
                );
                return;
            }
            const scopePick = scopePickRef.current;
            if (scopePick) {
                scopePickRef.current = null;
                const scope: RecurrenceEditScope = index === 0 ? 'this' : index === 1 ? 'thisAndFollowing' : 'all';
                setCandidates([]);
                armTarget(scopePick.event, scopePick.intent, scope);
                return;
            }
            const intent = pendingIntentRef.current;
            if (!intent) return;
            if (intent.kind === 'slot') {
                const slot = pendingSlotsRef.current[index];
                if (!slot || !account) return;
                pendingSlotsRef.current = [];
                setCandidates([]);
                const base = intent.summary?.trim();
                const summary = base
                    ? base.charAt(0).toUpperCase() + base.slice(1)
                    : intent.names?.length
                      ? t('voice.meetingWith', { names: intent.names.join(', ') })
                      : t('voice.meetingTitle');
                const synth: VoiceIntent = {
                    kind: 'create',
                    summary,
                    start: slot.start,
                    end: slot.end,
                    names: intent.names,
                    calendarName: intent.calendarName,
                };
                pendingIntentRef.current = synth;
                void routeCreate(synth, genRef.current);
                return;
            }
            if (intent.kind === 'create') {
                const cal = candidateCalendarsRef.current[index];
                if (!cal || !account) return;
                const attendees = pendingAttendeesRef.current;
                candidateCalendarsRef.current = [];
                pendingAttendeesRef.current = [];
                setCandidates([]);
                void armCreate(intent, cal, attendees, genRef.current);
                return;
            }
            const event = candidateEventsRef.current[index];
            if (!event || (intent.kind !== 'move' && intent.kind !== 'delete')) return;
            candidateEventsRef.current = [];
            setCandidates([]);
            armWithScopeDecision(event, intent);
        },
        [account, describeIntent, routeCreate, setStatus, armCreate, armTarget, armWithScopeDecision, cancelAutoClose, promptWith, t],
    );

    // auto-close timer needs the latest close() without re-creating replyWith
    useEffect(() => {
        closeRef.current = close;
    });

    useEffect(() => {
        let bgTimer: ReturnType<typeof setTimeout> | undefined;
        const sub = AppState.addEventListener('change', (status) => {
            if (status === 'background') {
                bgTimer = setTimeout(() => {
                    if (AppState.currentState === 'background') close();
                }, 1200);
            } else if (bgTimer) {
                clearTimeout(bgTimer);
                bgTimer = undefined;
            }
        });
        return () => {
            sub.remove();
            if (bgTimer) clearTimeout(bgTimer);
            genRef.current += 1;
            cancelAutoClose();
            stt.cancelListening();
            tts.stop();
        };
    }, [close, cancelAutoClose]);

    return {
        visible,
        state,
        transcript,
        intentDescription,
        candidates,
        reply,
        errorText,
        open,
        close,
        submitText,
        confirm,
        pickCandidate,
        relisten,
    };
}
