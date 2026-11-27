import {Q} from '@nozbe/watermelondb';
import type {Collection} from '@nozbe/watermelondb';

import {
    fetchCalendars,
    fetchEvents,
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
    row.calendarOrder = c.order ?? 0;
    row.isShared = c.isShared ?? false;
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
        (row.calendarOrder ?? 0) === (c.order ?? 0) &&
        (row.isShared ?? false) === (c.isShared ?? false) &&
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
        (row.attendees ?? '[]') === JSON.stringify(ev.attendees ?? []) &&
        (row.organizerEmail ?? undefined) === (ev.organizerEmail ?? undefined) &&
        (row.talkUrl ?? undefined) === (ev.talkUrl ?? undefined)
    );
}


async function syncCalendarsUncoordinated(account: Account): Promise<CalendarMeta[]> {
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

const calendarSyncsInFlight = new Map<string, Promise<CalendarMeta[]>>();

export function syncCalendars(account: Account): Promise<CalendarMeta[]> {
    const inFlight = calendarSyncsInFlight.get(account.id);
    if (inFlight) return inFlight;

    const startedAt = Date.now();
    const promise = (async () => {
        try {
            return await syncCalendarsUncoordinated(account);
        } finally {
            const duration = Date.now() - startedAt;
            if (__DEV__ && duration >= 20) console.log(`[sync] syncCalendars completed in ${duration}ms`);
            calendarSyncsInFlight.delete(account.id);
        }
    })();
    calendarSyncsInFlight.set(account.id, promise);
    return promise;
}

export function resetCalendarSyncCoordination(): void {
    calendarSyncsInFlight.clear();
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
const deltaKey = (account: Account, calendar: CalendarMeta) => `${account.id}\n${calendar.url}`;

export function resetDeltaSyncThrottle(): void {
    lastDeltaSyncAt.clear();
}

async function syncVisibleRangeNow(
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

    const now = Date.now();
    const throttled = (c: CalendarMeta) =>
        now - (lastDeltaSyncAt.get(deltaKey(account, c)) ?? 0) < DELTA_SYNC_MIN_INTERVAL_MS;

    const rangeOnly = (c: CalendarMeta) => c.isSubscribed || c.url.includes('/app-generated--');
    const deltaCals = inHorizon ? calendars.filter((c) => !rangeOnly(c) && !throttled(c)) : [];
    const fullCals = calendars.filter((c) => rangeOnly(c) || !inHorizon);

    if (deltaCals.length === 0 && fullCals.length === 0) return;

    const {failures, fulfilledIndexes} = await settleAll(
        deltaCals.map((cal) => () => syncCalendarDelta(account, cal).then((): never[] => [])),
        3,
    );

    const deltaCompletedAt = Date.now();
    for (const i of fulfilledIndexes) lastDeltaSyncAt.set(deltaKey(account, deltaCals[i]), deltaCompletedAt);

    const fulfilled = new Set(fulfilledIndexes);
    const rangeCals = fullCals.concat(deltaCals.filter((_, i) => !fulfilled.has(i)));

    let fullOk = false;
    if (rangeCals.length > 0) {
        try {
            await syncEvents(
                account, rangeCals, start, end, deleteMissing, calendars.map((c) => c.id),
            );
            fullOk = true;
        } catch (e) {
            failures.push(e);
        }
    }

    const deltaOk = fulfilledIndexes.length > 0;
    if (!deltaOk && !fullOk) {
        for (const c of deltaCals) lastDeltaSyncAt.delete(deltaKey(account, c));
        throw new Error(`[syncVisibleRange] all ${calendars.length} calendar sync(s) failed`);
    }
}

interface VisibleSyncRequest {
    account: Account;
    calendars: CalendarMeta[];
    start: Date;
    end: Date;
    deleteMissing: boolean;
}

interface VisibleSyncJob {
    key: string;
    request: VisibleSyncRequest;
    promise: Promise<void>;
    resolve: () => void;
    reject: (reason: unknown) => void;
    startedAt: number;
}

interface VisibleSyncLane {
    running?: VisibleSyncJob;
    pending?: VisibleSyncJob;
}

const visibleSyncLanes = new Map<string, VisibleSyncLane>();

function visibleSyncKey(request: VisibleSyncRequest): string {
    const calendarIds = request.calendars.map((c) => c.id).sort().join('\n');
    return [
        request.start.getTime(),
        request.end.getTime(),
        request.deleteMissing ? '1' : '0',
        calendarIds,
    ].join('\n');
}

function completeVisibleSync(lane: VisibleSyncLane, job: VisibleSyncJob, error?: unknown): void {
    const duration = Date.now() - job.startedAt;
    if (__DEV__ && duration >= 20) {
        console.log(`[sync] syncVisibleRange ${error === undefined ? 'completed' : 'failed'} in ${duration}ms`);
    }
    if (lane.running === job) lane.running = undefined;
    const next = lane.pending;
    lane.pending = undefined;
    if (next) {
        lane.running = next;
        startVisibleSync(lane, next);
    }

    // Resolve the public promise only after the lane has been released. This
    // keeps sequential callers from observing a stale in-flight sync and
    // accidentally queueing work that should start immediately.
    if (error === undefined) job.resolve();
    else job.reject(error);
}

function startVisibleSync(lane: VisibleSyncLane, job: VisibleSyncJob): void {
    const {account, calendars, start, end, deleteMissing} = job.request;
    void syncVisibleRangeNow(account, calendars, start, end, deleteMissing).then(
        () => completeVisibleSync(lane, job),
        (error) => completeVisibleSync(lane, job, error),
    );
}

export function syncVisibleRange(
    account: Account,
    calendars: CalendarMeta[],
    start: Date,
    end: Date,
    deleteMissing = true,
): Promise<void> {
    if (calendars.length === 0) return Promise.resolve();

    const request: VisibleSyncRequest = {account, calendars, start, end, deleteMissing};
    const key = visibleSyncKey(request);
    let lane = visibleSyncLanes.get(account.id);
    if (!lane) {
        lane = {};
        visibleSyncLanes.set(account.id, lane);
    }

    if (lane.running?.key === key) return lane.running.promise;
    if (lane.pending?.key === key) return lane.pending.promise;

    let resolve!: () => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    const job: VisibleSyncJob = {key, request, promise, resolve, reject, startedAt: Date.now()};

    if (!lane.running) {
        lane.running = job;
        startVisibleSync(lane, job);
    } else {
        // A newer visible range makes an older queued range obsolete. Resolve
        // the superseded caller as coalesced work instead of executing a stale
        // burst of network fetches and database writes it no longer needs.
        lane.pending?.resolve();
        lane.pending = job;
    }

    return promise;
}

export function resetVisibleSyncCoordination(): void {
    visibleSyncLanes.clear();
}

// SQLite caps the number of host variables per query; stay well under.
const HREF_QUERY_CHUNK = 200;

async function collectByHref(events: Collection<Event>, accountId: string, hrefs: Set<string>) {
    if (hrefs.size === 0) return [];
    const all = Array.from(hrefs);
    const out: Event[] = [];
    for (let i = 0; i < all.length; i += HREF_QUERY_CHUNK) {
        const chunk = all.slice(i, i + HREF_QUERY_CHUNK);
        const rows = await events
            .query(Q.where('account_id', accountId), Q.where('href', Q.oneOf(chunk)))
            .fetch();
        // The query does the heavy lifting (indexed lookup instead of a
        // full-table scan); the in-memory recheck is a cheap guard against
        // href sets drifting between the fetch and the diff.
        for (const r of rows) {
            if (hrefs.has(r.href)) out.push(r);
        }
    }
    return out;
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

    if (fullSync) {
        const fetched = await fetchEvents(account, calendar, horizon.start, horizon.end);

        const startMs = horizon.start.getTime();
        const endMs = horizon.end.getTime();
        await safeWrite(db, async () => {
            const ops = [];
            const existing = await events
                .query(Q.where('account_id', account.id), Q.where('calendar_id', calendar.id))
                .fetch();
            if (localWriteEpoch() !== epoch) return;
            for (const r of existing) {
                if (r.start < endMs && r.end > startMs) {
                    ops.push(r.prepareMarkAsDeleted());
                }
            }
            for (const ev of fetched) ops.push(prepareCreateEvent(events, ev));
            pushSyncTokenOp(ops, calendars, row, calendar, account, result.newToken, now);
            if (ops.length > 0) await db.batch(ops);
        }, 30000, 'syncCalendarDelta');
        return;
    }

    const {events: fetched, returnedHrefs} = await fetchEventsByHrefs(
        account, calendar, result.changed, horizon.start, horizon.end,
    );
    const changedSet = new Set(result.changed);

    const missing = result.changed.filter((h) => !returnedHrefs.has(h));
    if (missing.length > 0) {
        throw new Error(
            `[syncCalendarDelta] multiget returned ${returnedHrefs.size}/${changedSet.size} objects; skipping write`
        );
    }

    await safeWrite(db, async () => {
        const ops = [];
        const deletedSet = new Set(result.deleted);
        const touched = new Set<string>([...result.deleted, ...returnedHrefs]);
        const existing = await collectByHref(events, account.id, touched);
        if (localWriteEpoch() !== epoch) return;

        const remoteByKey = new Map<string, CalendarEvent>();
        for (const ev of fetched) {
            remoteByKey.set(eventKey(ev.accountId, ev.calendarId, ev.uid), ev);
        }

        // Diff in place rather than delete+recreate: rewriting rows wholesale
        // churns SQLite, rekeys every row and re-fires every observer even
        // when the re-fetched object is byte-identical to what we store.
        const claimedKeys = new Set<string>();
        for (const r of existing) {
            if (deletedSet.has(r.href)) {
                ops.push(r.prepareMarkAsDeleted());
                continue;
            }
            const k = rowKey(r);
            const remote = remoteByKey.get(k);
            if (!remote || claimedKeys.has(k)) {
                // The occurrence is gone from the re-fetched object (excluded,
                // restructured) or this row is a duplicate of one already kept.
                ops.push(r.prepareMarkAsDeleted());
                continue;
            }
            claimedKeys.add(k);
            if (!eventUnchanged(r, remote)) {
                ops.push(r.prepareUpdate((rec: Event) => writeEvent(rec, remote)));
            }
        }

        for (const ev of fetched) {
            const k = eventKey(ev.accountId, ev.calendarId, ev.uid);
            if (!claimedKeys.has(k) && remoteByKey.get(k) === ev) {
                ops.push(prepareCreateEvent(events, ev));
            }
        }
        pushSyncTokenOp(ops, calendars, row, calendar, account, result.newToken, now);

        if (ops.length > 0) await db.batch(ops);
    }, 30000, 'syncCalendarDelta');
}

function pushSyncTokenOp(
    ops: unknown[],
    calendars: Collection<Calendar>,
    row: Calendar | undefined,
    calendar: CalendarMeta,
    account: Account,
    newToken: string | undefined,
    now: Date,
): void {
    if (row) {
        ops.push(row.prepareUpdate((r: Calendar) => {
            r.syncToken = newToken ?? r.syncToken;
            r.expandedCenter = now.getTime();
        }));
    } else {
        ops.push(calendars.prepareCreate((r: Calendar) => {
            writeCalendar(r, calendar, account.id);
            r.syncToken = newToken ?? undefined;
            r.expandedCenter = now.getTime();
        }));
    }
}
