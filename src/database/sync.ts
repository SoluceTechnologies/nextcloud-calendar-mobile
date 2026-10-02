import {Q} from '@nozbe/watermelondb';
import type {Collection} from '@nozbe/watermelondb';

import {
    fetchCalendars,
    fetchEventsForCalendars,
    fetchEventsByHrefs,
    syncCollection,
} from '@/services/nextcloud/caldav';
import type {Account, CalendarEvent, CalendarMeta} from '@/types';
import type {SyncCollectionResult} from '@/services/nextcloud/caldav';
import {expansionHorizon, needsHorizonReset} from '@/features/calendar/utils/horizon';
import {settleAll} from '@/utils/settle';

import {getDatabaseInstance} from './DatabaseProvider';
import Calendar from './models/Calendar';
import Event from './models/Event';
import {safeWrite} from './utils/safeTransaction';

export function eventKey(accountId: string, calendarId: string, uid: string): string {
    return `${accountId}|${calendarId}|${uid}`;
}

function rowKey(r: Event): string {
    return eventKey(r.accountId, r.calendarId, r.uid);
}

export function prepareCreateEvent(events: Collection<Event>, ev: CalendarEvent) {
    return events.prepareCreate((r: Event) => writeEvent(r, ev));
}


function writeCalendar(row: Calendar, c: CalendarMeta, accountId: string): void {
    row.accountId = accountId;
    row.remoteId = c.id;
    row.displayName = c.displayName;
    row.color = c.color;
    row.ctag = c.ctag;
    row.url = c.url;
    row.slug = c.slug;
    row.isSubscribed = c.isSubscribed ?? false;
    row.isReadOnly = c.isReadOnly ?? false;
    row.sourceUrl = c.sourceUrl ?? undefined;
    row.supportsEvents = c.supportsEvents ?? true;
}

export function serializeAlarms(alarms?: number[]): string | undefined {
    if (alarms === undefined) return undefined;
    return JSON.stringify([...new Set(alarms)].sort((a, b) => b - a));
}

export function writeEvent(row: Event, ev: CalendarEvent): void {
    row.accountId = ev.accountId;
    row.calendarId = ev.calendarId;
    row.uid = ev.uid;
    row.href = ev.href;
    row.summary = ev.summary;
    row.description = ev.description ?? undefined;
    row.location = ev.location ?? undefined;
    row.start = ev.dtstart.getTime();
    row.end = ev.dtend.getTime();
    row.allDay = ev.allDay;
    row.color = ev.color;
    row.attendees = JSON.stringify(ev.attendees ?? []);
    row.organizerEmail = ev.organizerEmail ?? undefined;
    row.talkUrl = ev.talkUrl ?? undefined;
    row.isRecurring = ev.isRecurring;
    row.rrule = ev.rrule ?? undefined;
    row.recurrenceId = ev.recurrenceId?.getTime() ?? undefined;
    row.alarms = serializeAlarms(ev.alarms);
    row.alarmMinutes = ev.alarms?.[0] ?? undefined;
    row.isTask = ev.isTask ?? false;
}

function calendarUnchanged(row: Calendar, c: CalendarMeta): boolean {
    return (
        row.displayName === c.displayName &&
        row.color === c.color &&
        row.ctag === c.ctag &&
        row.url === c.url &&
        row.slug === c.slug &&
        (row.isSubscribed ?? false) === (c.isSubscribed ?? false) &&
        (row.isReadOnly ?? false) === (c.isReadOnly ?? false) &&
        (row.supportsEvents ?? true) === (c.supportsEvents ?? true) &&
        (row.sourceUrl ?? undefined) === (c.sourceUrl ?? undefined)
    );
}

function eventUnchanged(row: Event, ev: CalendarEvent): boolean {
    return (
        row.start === ev.dtstart.getTime() &&
        row.end === ev.dtend.getTime() &&
        row.summary === ev.summary &&
        (row.description ?? undefined) === (ev.description ?? undefined) &&
        (row.location ?? undefined) === (ev.location ?? undefined) &&
        !!row.allDay === ev.allDay &&
        row.color === ev.color &&
        row.calendarId === ev.calendarId &&
        row.href === ev.href &&
        (row.rrule ?? undefined) === (ev.rrule ?? undefined) &&
        (row.recurrenceId ?? undefined) === (ev.recurrenceId?.getTime() ?? undefined) &&
        !!row.isTask === !!ev.isTask &&
        (row.alarms ?? undefined) === serializeAlarms(ev.alarms) &&
        (row.attendees ?? '[]') === JSON.stringify(ev.attendees ?? [])
    );
}


export async function syncCalendars(account: Account): Promise<CalendarMeta[]> {
    const remote = await fetchCalendars(account);
    const db = getDatabaseInstance();
    const calendars = db.get<Calendar>('calendars');
    const events = db.get<Event>('events');

    await safeWrite(db, async () => {
        const existing = await calendars.query(Q.where('account_id', account.id)).fetch();
        const byRemote = new Map(existing.map((r) => [r.remoteId, r]));
        const seen = new Set<string>();
        const ops = [];

        for (const c of remote) {
            seen.add(c.id);
            const found = byRemote.get(c.id);
            if (!found) {
                ops.push(calendars.prepareCreate((r: Calendar) => writeCalendar(r, c, account.id)));
            } else if (!calendarUnchanged(found, c)) {
                ops.push(found.prepareUpdate((r: Calendar) => writeCalendar(r, c, account.id)));
            }
        }

        const removed = existing.filter((r) => !seen.has(r.remoteId));
        for (const r of removed) ops.push(r.prepareMarkAsDeleted());

        if (removed.length > 0) {
            const orphans = await events
                .query(
                    Q.where('account_id', account.id),
                    Q.where('calendar_id', Q.oneOf(removed.map((r) => r.remoteId))),
                )
                .fetch();
            for (const ev of orphans) ops.push(ev.prepareMarkAsDeleted());
        }

        if (ops.length > 0) await db.batch(ops);
    }, 20000, 'syncCalendars');

    return remote;
}


let localWrites = 0;

export function markLocalWrite(): void {
    localWrites += 1;
}

export function localWriteEpoch(): number {
    return localWrites;
}

export function seriesBaseUid(uid: string): string {
    const i = uid.indexOf('_occ_');
    return i === -1 ? uid : uid.slice(0, i);
}

export async function syncEvents(
    account: Account,
    calendars: CalendarMeta[],
    start: Date,
    end: Date,
    deleteMissing = true,
    knownCalendarIds?: readonly string[],
): Promise<void> {
    if (calendars.length === 0) return;

    const epoch = localWriteEpoch();
    const {
        events: remote,
        syncedCalendarIds,
        failures,
    } = await fetchEventsForCalendars(account, calendars, start, end);

    if (syncedCalendarIds.length === 0) {
        throw new Error(
            `[syncEvents] ${failures.length}/${calendars.length} calendar fetch(es) failed`,
        );
    }

    const db = getDatabaseInstance();
    const events = db.get<Event>('events');
    const startMs = start.getTime();
    const endMs = end.getTime();

    await safeWrite(db, async () => {
        const windowRows = await events
            .query(
                Q.where('account_id', account.id),
                Q.where('start', Q.lt(endMs)),
                Q.where('end', Q.gt(startMs)),
            )
            .fetch();

        if (localWriteEpoch() !== epoch) return;

        const windowKeys = new Set(windowRows.map(rowKey));
        const strayUids = remote
            .filter((ev) => !windowKeys.has(eventKey(ev.accountId, ev.calendarId, ev.uid)))
            .map((ev) => ev.uid);
        const strayRows = strayUids.length
            ? await events
                .query(Q.where('account_id', account.id), Q.where('uid', Q.oneOf(strayUids)))
                .fetch()
            : [];

        if (localWriteEpoch() !== epoch) return;

        const inWindow = new Set(windowRows.map((r) => r.id));
        const byKey = new Map<string, Event>();
        const ops = [];
        for (const r of [...windowRows, ...strayRows]) {
            const k = rowKey(r);
            const kept = byKey.get(k);
            if (!kept) byKey.set(k, r);
            else if (kept.id !== r.id) ops.push(r.prepareMarkAsDeleted());
        }

        const seen = new Set<string>();
        for (const ev of remote) {
            const k = eventKey(ev.accountId, ev.calendarId, ev.uid);
            if (seen.has(k)) continue;
            seen.add(k);
            const found = byKey.get(k);
            if (!found) {
                ops.push(prepareCreateEvent(events, ev));
            } else if (!eventUnchanged(found, ev)) {
                ops.push(found.prepareUpdate((r: Event) => writeEvent(r, ev)));
            }
        }

        if (deleteMissing) {
            const syncedIds = new Set(syncedCalendarIds);
            const knownIds = new Set(knownCalendarIds ?? calendars.map((c) => c.id));
            for (const [k, r] of byKey) {
                if (seen.has(k)) continue;
                if (!inWindow.has(r.id)) continue;
                if (syncedIds.has(r.calendarId) || !knownIds.has(r.calendarId)) {
                    ops.push(r.prepareMarkAsDeleted());
                }
            }
        }

        if (ops.length > 0) await db.batch(ops);
    }, 30000, 'syncEvents');
}

const DELTA_SYNC_MIN_INTERVAL_MS = 10_000;
const lastDeltaSyncAt = new Map<string, number>();

/** Test-only: reset the throttle between syncVisibleRange calls. */
export function resetDeltaSyncThrottle(): void {
    lastDeltaSyncAt.clear();
}

export async function syncVisibleRange(
    account: Account,
    calendars: CalendarMeta[],
    start: Date,
    end: Date,
    deleteMissing = true,
): Promise<void> {
    if (calendars.length === 0) return;

    const horizon = expansionHorizon(new Date());
    const inHorizon =
        start.getTime() >= horizon.start.getTime() && end.getTime() <= horizon.end.getTime();

    const throttled =
        Date.now() - (lastDeltaSyncAt.get(account.id) ?? 0) < DELTA_SYNC_MIN_INTERVAL_MS;

    // App-generated calendars (Deck boards, …) are Nextcloud ExternalCalendars:
    // no sync token, so sync-collection answers 415 — range fetch only.
    const rangeOnly = (c: CalendarMeta) => c.isSubscribed || c.url.includes('/app-generated--');
    const deltaCals =
        inHorizon && !throttled ? calendars.filter((c) => !rangeOnly(c)) : [];
    const fullCals = calendars.filter((c) => rangeOnly(c) || !inHorizon);

    if (deltaCals.length === 0 && fullCals.length === 0) return;
    if (deltaCals.length > 0) lastDeltaSyncAt.set(account.id, Date.now());

    const {failures, fulfilledIndexes} = await settleAll(
        deltaCals.map((cal) => () => syncCalendarDelta(account, cal).then((): never[] => [])),
    );

    let fullOk = false;
    if (fullCals.length > 0) {
        try {
            await syncEvents(
                account, fullCals, start, end, deleteMissing, calendars.map((c) => c.id),
            );
            fullOk = true;
        } catch (e) {
            failures.push(e);
        }
    }

    const deltaOk = deltaCals.length > 0 && fulfilledIndexes.length > 0;
    if (!deltaOk && !fullOk) {
        lastDeltaSyncAt.delete(account.id);
        throw new Error(`[syncVisibleRange] all ${calendars.length} calendar sync(s) failed`);
    }
}

async function collectByHref(events: Collection<Event>, accountId: string, hrefs: Set<string>) {
    const rows = await events.query(Q.where('account_id', accountId)).fetch();
    return rows.filter((r) => hrefs.has(r.href));
}


export async function syncCalendarDelta(account: Account, calendar: CalendarMeta): Promise<void> {
    const db = getDatabaseInstance();
    const events = db.get<Event>('events');
    const calendars = db.get<Calendar>('calendars');

    const now = new Date();
    const horizon = expansionHorizon(now);

    const row = (
        await calendars
            .query(Q.where('account_id', account.id), Q.where('url', calendar.url))
            .fetch()
    )[0];
    const storedToken = row?.syncToken;
    const forceFull = needsHorizonReset(row?.expandedCenter, now);

    const epoch = localWriteEpoch();

    let result: SyncCollectionResult = await syncCollection(
        account, calendar, forceFull ? '' : storedToken,
    );
    if (result.reset) {
        result = await syncCollection(account, calendar, '');
    }
    const fullSync = result.reset || forceFull || !storedToken;

    const {events: fetched, returnedHrefs} = await fetchEventsByHrefs(
        account, calendar, result.changed, horizon.start, horizon.end,
    );
    const changedSet = new Set(result.changed);

    const missing = result.changed.filter((h) => !returnedHrefs.has(h));
    if (missing.length > 0) {
        console.warn(
            `[syncCalendarDelta] multiget returned ${returnedHrefs.size}/${changedSet.size} objects; skipping write`
        );
        return;
    }

    await safeWrite(db, async () => {
        const ops = [];
        const deletedSet = new Set(result.deleted);

        if (fullSync) {
            const existing = await events
                .query(Q.where('account_id', account.id), Q.where('calendar_id', calendar.id))
                .fetch();
            if (localWriteEpoch() !== epoch) return;
            if (result.changed.length > 0) {
                for (const r of existing) {
                    if (!changedSet.has(r.href) || returnedHrefs.has(r.href)) {
                        ops.push(r.prepareMarkAsDeleted());
                    }
                }
            }
        } else {
            const touched = new Set<string>([...result.deleted, ...returnedHrefs]);
            const existing = await collectByHref(events, account.id, touched);
            if (localWriteEpoch() !== epoch) return;
            for (const r of existing) {
                if (deletedSet.has(r.href) || returnedHrefs.has(r.href)) {
                    ops.push(r.prepareMarkAsDeleted());
                }
            }
        }

        for (const ev of fetched) ops.push(prepareCreateEvent(events, ev));

        if (row) {
            ops.push(row.prepareUpdate((r: Calendar) => {
                r.syncToken = result.newToken ?? r.syncToken;
                r.expandedCenter = now.getTime();
            }));
        } else {
            ops.push(calendars.prepareCreate((r: Calendar) => {
                writeCalendar(r, calendar, account.id);
                r.syncToken = result.newToken ?? undefined;
                r.expandedCenter = now.getTime();
            }));
        }

        if (ops.length > 0) await db.batch(ops);
    }, 30000, 'syncCalendarDelta');
}
