import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';

import type { Account, CalendarEvent, CalendarMeta } from '@/types';
import { useSettingsStore } from '@/stores/settingsStore';
import { getNativePickerLocale } from '@/utils/i18n';
import { resolveUse24h } from '@/utils/timeFormat';
import { eventToInput } from '@/features/calendar/utils/eventToInput';
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
import { parseUtterance, type VoiceIntent } from '@/services/voice/intents';
import { askAgent, isAgentAvailable, AgentError } from '@/services/voice/agent';
import {
    eventsOnDay,
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
    | { kind: 'move'; event: CalendarEvent; dtstart: Date; dtend: Date }
    | { kind: 'delete'; event: CalendarEvent };

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
    const pendingIntentRef = useRef<VoiceIntent | null>(null);
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

    // --- TTS chain (same gen-guard pattern as useBriefing) ---
    const speakSegments = useCallback(
        (segs: BriefingSegment[], gen: number, voice: string) => {
            const speakAt = (i: number) => {
                if (genRef.current !== gen || i >= segs.length) return;
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
        (text: string, gen: number, voice: string) => {
            tts.speak(text, { language: voice });
        },
        [],
    );

    const replyWith = useCallback(
        (text: string, opts?: { segs?: BriefingSegment[] }) => {
            const gen = genRef.current;
            const { voice } = locale();
            setReply(text);
            setIntentDescription(undefined);
            setCandidates([]);
            setStatus('replying');
            if (opts?.segs?.length) speakSegments(opts.segs, gen, voice);
            else if (text) say(text, gen, voice);
        },
        [locale, speakSegments, say, setStatus],
    );

    // --- intent description shown on the confirmation card ---
    const describeIntent = useCallback(
        (intent: VoiceIntent): string => {
            const l = getNativePickerLocale(language);
            const fmt = (d: Date) => dayjs(d).locale(l).format('dddd D MMMM · HH:mm');
            switch (intent.kind) {
                case 'create':
                    return t('voice.confirmCreate', {
                        title: intent.summary?.trim() || t('voice.untitled'),
                        when: fmt(effectiveStart(intent)),
                    });
                case 'move':
                    return t('voice.confirmMove', {
                        title: intent.target.title || t('voice.untitled'),
                        when: fmt(intent.newStart),
                    });
                case 'delete':
                    return t('voice.confirmDelete', { title: intent.target.title || t('voice.untitled') });
                default:
                    return '';
            }
        },
        [language, t],
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
                    case 'create': {
                        const names = intent.names ?? [];
                        let attendees = [] as Awaited<ReturnType<typeof resolveAttendeeNames>>['attendees'];
                        let dropped: string[] = [];
                        if (names.length) {
                            const resolved = await resolveAttendeeNames(account, names);
                            attendees = resolved.attendees;
                            dropped = resolved.ambiguous;
                        }
                        if (genRef.current !== gen) return;
                        pendingIntentRef.current = intent;
                        pendingRef.current = {
                            kind: 'create',
                            input: inputFromCreateIntent(intent, {
                                calendarId: calendars[0]?.id ?? '',
                                organizerEmail: account.username,
                                organizerName: account.username,
                                attendees,
                            }),
                        };
                        const droppedNote = dropped.length
                            ? ` — ${t('voice.attendeesDropped', { names: dropped.join(', ') })}`
                            : '';
                        setIntentDescription(describeIntent(intent) + droppedNote);
                        setStatus('confirming');
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
                            setStatus('disambiguating');
                            return;
                        }
                        const event = matches[0];
                        pendingRef.current =
                            intent.kind === 'move'
                                ? { kind: 'move', event, ...movedDates(event, intent.newStart) }
                                : { kind: 'delete', event };
                        setIntentDescription(describeIntent(intent));
                        setStatus('confirming');
                        return;
                    }
                    case 'freeform': {
                        const available = account ? await isAgentAvailable(account) : false;
                        if (genRef.current !== gen) return;
                        if (!available) {
                            replyWith(t('voice.notUnderstood'));
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
                    setErrorText(t('voice.serverError'));
                    setStatus('error');
                }
            }
        },
        [account, calendars, locale, describeIntent, replyWith, setStatus, t],
    );

    const handleUtterance = useCallback(
        (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) return;
            const gen = genRef.current;
            setTranscript(trimmed);
            setReply(undefined);
            setStatus('parsed');
            void routeIntent(parseUtterance(trimmed, { locale: getNativePickerLocale(language) }), gen);
        },
        [language, routeIntent, setStatus],
    );

    const listen = useCallback(async () => {
        const { locale: loc } = locale();
        const gen = genRef.current;
        setTranscript('');
        setReply(undefined);
        if (!stt.isSttAvailable()) {
            setErrorText(t('voice.sttUnavailable'));
            setStatus('error');
            return;
        }
        const granted = await stt.requestSttPermissions();
        if (genRef.current !== gen) return;
        if (!granted) {
            setErrorText(t('voice.permissionDenied'));
            setStatus('error');
            return;
        }
        setStatus('listening');
        stt.startListening({
            locale: loc,
            onPartial: (text) => {
                if (genRef.current === gen) setTranscript(text);
            },
            onResult: (text) => {
                if (genRef.current === gen) handleUtterance(text);
            },
            onError: () => {
                if (genRef.current !== gen) return;
                setErrorText(t('voice.sttUnavailable'));
                setStatus('error');
            },
        });
    }, [handleUtterance, locale, setStatus, t]);

    const open = useCallback(() => {
        genRef.current += 1;
        setVisible(true);
        setTranscript('');
        setReply(undefined);
        setIntentDescription(undefined);
        setCandidates([]);
        setErrorText(undefined);
        void listen();
    }, [listen]);

    const close = useCallback(() => {
        genRef.current += 1;
        abortRef.current?.abort();
        abortRef.current = null;
        stt.cancelListening();
        tts.stop();
        pendingRef.current = null;
        candidateEventsRef.current = [];
        pendingIntentRef.current = null;
        setVisible(false);
        setStatus('idle');
    }, [setStatus]);

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
        stt.cancelListening();
        abortRef.current?.abort();
        tts.stop();
        void listen();
    }, [listen]);

    const confirm = useCallback(async () => {
        const op = pendingRef.current;
        if (!account || !op) return;
        const gen = genRef.current;
        setStatus('executing');
        try {
            if (op.kind === 'create') {
                await createEvent.mutateAsync(op.input);
                if (genRef.current !== gen) return;
                replyWith(t('voice.created'));
            } else if (op.kind === 'move') {
                await updateEvent.mutateAsync({
                    event: op.event,
                    input: { ...eventToInput(op.event, account), dtstart: op.dtstart, dtend: op.dtend },
                    datesOnly: true,
                });
                if (genRef.current !== gen) return;
                replyWith(t('voice.moved'));
            } else {
                await deleteEvent.mutateAsync({ event: op.event });
                if (genRef.current !== gen) return;
                replyWith(t('voice.deleted'));
            }
            pendingRef.current = null;
            pendingIntentRef.current = null;
        } catch (e) {
            if (__DEV__) console.warn('[voice] mutation failed', e);
            if (genRef.current === gen) {
                setErrorText(t('voice.serverError'));
                setStatus('error');
            }
        }
    }, [account, createEvent, updateEvent, deleteEvent, replyWith, setStatus, t]);

    const pickCandidate = useCallback(
        (index: number) => {
            const intent = pendingIntentRef.current;
            const event = candidateEventsRef.current[index];
            if (!intent || !event || (intent.kind !== 'move' && intent.kind !== 'delete')) return;
            pendingRef.current =
                intent.kind === 'move'
                    ? { kind: 'move', event, ...movedDates(event, intent.newStart) }
                    : { kind: 'delete', event };
            candidateEventsRef.current = [];
            setCandidates([]);
            setIntentDescription(describeIntent(intent));
            setStatus('confirming');
        },
        [describeIntent, setStatus],
    );

    useEffect(() => {
        const sub = AppState.addEventListener('change', (status) => {
            if (status === 'background') close();
        });
        return () => {
            sub.remove();
            genRef.current += 1;
            stt.cancelListening();
            tts.stop();
        };
    }, [close]);

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
