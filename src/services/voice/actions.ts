import { Q } from '@nozbe/watermelondb';
import dayjs from 'dayjs';

import type { Account, Attendee, CalendarEvent, CreateEventInput } from '@/types';
import { database } from '@/database';
import Event from '@/database/models/Event';
import { mapEventToShared } from '@/database/mappers/event';
import { normalizeEvents } from '@/utils/normalizeEvent';
import { useCalendarStore } from '@/stores/calendarStore';
import { fetchSharees } from '@/services/nextcloud/sharees';
import type { VoiceIntent } from './intents';

type TaskAccount = Pick<Account, 'baseUrl' | 'username' | 'appPassword'>;

function startOfDay(d: Date): number {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

async function eventsInRange(accountId: string, rangeStart: number, rangeEnd: number): Promise<CalendarEvent[]> {
    const rows = await database
        .get<Event>('events')
        .query(
            Q.where('account_id', accountId),
            Q.where('start', Q.lt(rangeEnd)),
            Q.where('end', Q.gte(rangeStart)),
        )
        .fetch();
    const hidden = useCalendarStore.getState().hiddenCalendarIds;
    return normalizeEvents(rows.map(mapEventToShared).filter((e) => !hidden.includes(e.calendarId)));
}

export async function eventsOnDay(accountId: string, day: Date): Promise<CalendarEvent[]> {
    return eventsInRange(accountId, startOfDay(day), startOfDay(day) + 86_400_000);
}

export async function nextEventAfter(accountId: string, now: Date = new Date()): Promise<CalendarEvent | undefined> {
    const events = await eventsInRange(accountId, startOfDay(now), startOfDay(now) + 14 * 86_400_000);
    return events
        .filter((e) => new Date(e.dtend).getTime() > now.getTime() && !e.isTask)
        .sort((a, b) => new Date(a.dtstart).getTime() - new Date(b.dtstart).getTime())[0];
}

const TARGET_WINDOW_BEFORE = 3;
const TARGET_WINDOW_AFTER = 14;

/**
 * Finds events matching a move/delete target: substring match on title, then
 * (if a when was spoken) narrowed to events starting around it.
 */
export async function findEventTargets(
    accountId: string,
    target: { title?: string; when?: Date },
    now: Date = new Date(),
): Promise<CalendarEvent[]> {
    const base = target.when ?? now;
    const events = await eventsInRange(
        accountId,
        startOfDay(base) - TARGET_WINDOW_BEFORE * 86_400_000,
        startOfDay(base) + TARGET_WINDOW_AFTER * 86_400_000,
    );
    let matches = events;
    if (target.title?.trim()) {
        const needle = target.title.trim().toLowerCase();
        matches = events.filter((e) => (e.summary ?? '').toLowerCase().includes(needle));
    }
    if (target.when) {
        const sameDay = matches.filter((e) => dayjs(e.dtstart).isSame(target.when, 'day'));
        const sameHour = sameDay.filter((e) => dayjs(e.dtstart).hour() === dayjs(target.when).hour());
        if (sameHour.length) return sameHour;
        if (sameDay.length) return sameDay;
    }
    return matches;
}

export interface FreeSlot {
    start: Date;
    end: Date;
}

/**
 * Gaps of at least `durationMin` inside the working window of `day`
 * (default 09:00–18:00). Slot starts align on :00/:30; busy intervals are the
 * account's events clipped to the window, so all-day and boundary events block
 * correctly. `minStart` keeps "today" proposals in the future.
 */
export function findFreeSlots(
    events: CalendarEvent[],
    day: Date,
    opts: { durationMin?: number; windowStart?: number; windowEnd?: number; minStart?: Date; max?: number } = {},
): FreeSlot[] {
    const dur = (opts.durationMin ?? 60) * 60_000;
    const day0 = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
    const win0 = day0 + (opts.windowStart ?? 9) * 3_600_000;
    const win1 = day0 + (opts.windowEnd ?? 18) * 3_600_000;
    const max = opts.max ?? 6;
    const busy = events
        .filter((e) => !e.isTask)
        .map((e) => [Math.max(new Date(e.dtstart).getTime(), win0), Math.min(new Date(e.dtend).getTime(), win1)])
        .filter(([s, e]) => e! > s!)
        .sort((a, b) => a[0]! - b[0]!);
    const slots: FreeSlot[] = [];
    const align = (t: number) => Math.ceil(t / 1_800_000) * 1_800_000;
    const floor = (t: number) => Math.floor(t / 1_800_000) * 1_800_000;
    let cursor = Math.max(win0, opts.minStart?.getTime() ?? 0);
    for (const [bs, be] of [...busy, [win1, win1] as number[]]) {
        const gapEnd = Math.min(bs!, win1);
        const first = align(cursor);
        const last = floor(gapEnd - dur);
        // up to 3 evenly-spaced starts per gap: first, middle, last
        const starts = [...new Set([first, align((first + last) / 2), last])].filter(
            (s) => s >= cursor && s + dur <= gapEnd,
        );
        for (const s of starts) {
            if (slots.length >= max) break;
            slots.push({ start: new Date(s), end: new Date(s + dur) });
        }
        cursor = Math.max(cursor, be!);
    }
    return slots;
}

export interface ResolvedAttendees {
    attendees: Attendee[];
    ambiguous: string[];
}

/** Spoken names → attendees; a name resolves ONLY on a unique sharee match. */
export async function resolveAttendeeNames(account: TaskAccount, names: string[]): Promise<ResolvedAttendees> {
    const attendees: Attendee[] = [];
    const ambiguous: string[] = [];
    for (const name of names) {
        const results = await fetchSharees({ account, query: name }).catch(() => []);
        const lower = name.toLowerCase();
        const exact = results.filter(
            (r) =>
                r.displayName.toLowerCase() === lower ||
                r.email.toLowerCase() === lower ||
                r.email.toLowerCase().startsWith(lower + '@'),
        );
        const hit = exact.length === 1 ? exact[0] : results.length === 1 ? results[0] : null;
        if (hit?.email) {
            attendees.push({ email: hit.email, displayName: hit.displayName || name });
        } else {
            ambiguous.push(name);
        }
    }
    return { attendees, ambiguous };
}

/**
 * Effective start for a create intent: the parser encodes "day without time" as
 * local midnight — a midnight event is never what was meant, so 00:00 maps to
 * 09:00 that day. Past starts clamp onto now.
 */
export function effectiveStart(intent: Extract<VoiceIntent, { kind: 'create' }>, now: Date = new Date()): Date {
    const s = intent.start;
    const start =
        s.getHours() === 0 && s.getMinutes() === 0
            ? new Date(s.getFullYear(), s.getMonth(), s.getDate(), 9, 0)
            : s;
    return start.getTime() >= now.getTime() ? start : now;
}

export function inputFromCreateIntent(
    intent: Extract<VoiceIntent, { kind: 'create' }>,
    ctx: { calendarId: string; organizerEmail: string; organizerName: string; attendees: Attendee[] },
    now: Date = new Date(),
): CreateEventInput {
    const start = effectiveStart(intent, now);
    const end = intent.end ?? new Date(start.getTime() + 60 * 60 * 1000);
    return {
        summary: intent.summary?.trim() || 'Sans titre',
        calendarId: ctx.calendarId,
        dtstart: start,
        dtend: end,
        allDay: false,
        attendees: ctx.attendees,
        withTalkRoom: false,
        organizerEmail: ctx.organizerEmail,
        organizerName: ctx.organizerName,
    };
}

/** Shifted copy of `event`'s input for move intents (duration preserved). */
export function movedDates(event: CalendarEvent, newStart: Date): { dtstart: Date; dtend: Date } {
    const duration = new Date(event.dtend).getTime() - new Date(event.dtstart).getTime();
    return { dtstart: newStart, dtend: new Date(newStart.getTime() + Math.max(0, duration)) };
}
