import { Q } from '@nozbe/watermelondb';

import type { CalendarEvent } from '@/types';

import { getDatabaseInstance } from './DatabaseProvider';
import { mapEventToShared } from './mappers/event';
import Event from './models/Event';
import { markPending } from './pendingWrites';
import { eventKey, prepareCreateEvent, seriesBaseUid, serializeAlarms, writeEvent } from './sync';
import { safeWrite } from './utils/safeTransaction';

const events = () => getDatabaseInstance().get<Event>('events');

const keyOf = (r: Event) => eventKey(r.accountId, r.calendarId, r.uid);

export { seriesBaseUid };

function seriesRows(accountId: string, baseUid: string): Promise<Event[]> {
  return events()
    .query(
      Q.where('account_id', accountId),
      Q.where('uid', Q.like(`${Q.sanitizeLikeString(baseUid)}%`)),
    )
    .fetch();
}

function applyPatch(row: Event, patch: Partial<CalendarEvent>): void {
  if (patch.summary !== undefined) row.summary = patch.summary;
  if (patch.dtstart !== undefined) row.start = patch.dtstart.getTime();
  if (patch.dtend !== undefined) row.end = patch.dtend.getTime();
  if (patch.allDay !== undefined) row.allDay = patch.allDay;
  if (patch.description !== undefined) row.description = patch.description ?? undefined;
  if (patch.location !== undefined) row.location = patch.location ?? undefined;
  if (patch.attendees !== undefined) row.attendees = JSON.stringify(patch.attendees);
  if (patch.calendarId !== undefined) row.calendarId = patch.calendarId;
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.href !== undefined) row.href = patch.href;
  if ('alarms' in patch) {
    row.alarms = serializeAlarms(patch.alarms);
    row.alarmMinutes = patch.alarms?.[0] ?? undefined;
  }
}

/**
 * Insert or update events locally. Returns the event keys that were marked
 * pending so the caller can release them once the server push resolves.
 * Pass `trackPending: false` for writes that merely restore server state
 * (post-push rewrite, rollback) — they are not un-pushed intents.
 */
export async function insertEvents(
  list: CalendarEvent[],
  opts?: { trackPending?: boolean },
): Promise<string[]> {
  if (list.length === 0) return [];
  const db = getDatabaseInstance();
  const marked: string[] = [];
  await safeWrite(db, async () => {
    const uids = list.map((ev) => ev.uid);
    const existing = await events().query(Q.where('uid', Q.oneOf(uids))).fetch();
    const byKey = new Map(existing.map((r) => [keyOf(r), r]));
    const seen = new Set<string>();
    const ops = [];
    for (const ev of list) {
      const k = eventKey(ev.accountId, ev.calendarId, ev.uid);
      if (seen.has(k)) continue;
      seen.add(k);
      marked.push(k);
      const found = byKey.get(k);
      ops.push(
        found
          ? found.prepareUpdate((r: Event) => writeEvent(r, ev))
          : prepareCreateEvent(events(), ev),
      );
    }
    if (opts?.trackPending !== false) markPending(marked);
    await db.batch(ops);
  }, 15000, 'insertEvents');
  return marked;
}

export async function patchByUid(
  accountId: string,
  uid: string,
  patch: Partial<CalendarEvent>,
): Promise<string[]> {
  const db = getDatabaseInstance();
  const marked: string[] = [];
  await safeWrite(db, async () => {
    const rows = await events()
      .query(Q.where('account_id', accountId), Q.where('uid', uid))
      .fetch();
    for (const r of rows) marked.push(keyOf(r));
    // A calendar move rewrites calendarId: remote ops on the post-move key
    // must also be skipped.
    if (patch.calendarId !== undefined) marked.push(eventKey(accountId, patch.calendarId, uid));
    if (marked.length > 0) markPending(marked);
    await db.batch(rows.map((r) => r.prepareUpdate((row: Event) => applyPatch(row, patch))));
  }, 15000, 'patchByUid');
  return marked;
}

export async function shiftSeriesDates(
  accountId: string,
  baseUid: string,
  deltaStartMs: number,
  deltaEndMs: number,
  patch: Omit<Partial<CalendarEvent>, 'dtstart' | 'dtend'>,
): Promise<string[]> {
  const db = getDatabaseInstance();
  const marked: string[] = [];
  await safeWrite(db, async () => {
    const rows = await seriesRows(accountId, baseUid);
    const target = rows.filter((r) => seriesBaseUid(r.uid) === baseUid);
    for (const r of target) marked.push(keyOf(r));
    if (marked.length > 0) markPending(marked);
    await db.batch(
      target.map((r) =>
        r.prepareUpdate((row: Event) => {
          applyPatch(row, patch);
          row.start = row.start + deltaStartMs;
          row.end = row.end + deltaEndMs;
        })
      )
    );
  }, 15000, 'shiftSeriesDates');
  return marked;
}

export async function snapshotByBase(accountId: string, baseUid: string): Promise<CalendarEvent[]> {
  const rows = await seriesRows(accountId, baseUid);
  return rows.filter((r) => seriesBaseUid(r.uid) === baseUid).map(mapEventToShared);
}

export async function removeWhere(
  accountId: string,
  predicate: (e: CalendarEvent) => boolean,
  opts?: { trackPending?: boolean },
): Promise<CalendarEvent[]> {
  const db = getDatabaseInstance();
  let removed: CalendarEvent[] = [];
  await safeWrite(db, async () => {
    const rows = await events().query(Q.where('account_id', accountId)).fetch();
    const target = rows.filter((r) => predicate(mapEventToShared(r)));
    removed = target.map(mapEventToShared);
    if (opts?.trackPending !== false) markPending(target.map(keyOf));
    await db.batch(target.map((r) => r.prepareMarkAsDeleted()));
  }, 15000, 'removeWhere');
  return removed;
}

/**
 * Rollback helper: restores a snapshot captured before an optimistic write.
 * The restored rows match server state, so nothing is marked pending.
 */
export async function restoreSeries(
  accountId: string,
  baseUid: string,
  snapshot: CalendarEvent[],
): Promise<void> {
  const db = getDatabaseInstance();
  await safeWrite(db, async () => {
    const rows = await seriesRows(accountId, baseUid);
    const baseRows = rows.filter((r) => seriesBaseUid(r.uid) === baseUid);
    const byKey = new Map(baseRows.map((r) => [keyOf(r), r]));
    const snapKeys = new Set(snapshot.map((ev) => eventKey(ev.accountId, ev.calendarId, ev.uid)));

    const ops = [
      ...snapshot.map((ev) => {
        const found = byKey.get(eventKey(ev.accountId, ev.calendarId, ev.uid));
        return found
          ? found.prepareUpdate((r: Event) => writeEvent(r, ev))
          : prepareCreateEvent(events(), ev);
      }),
      ...baseRows.filter((r) => !snapKeys.has(keyOf(r))).map((r) => r.prepareMarkAsDeleted()),
    ];
    await db.batch(ops);
  }, 15000, 'restoreSeries');
}
