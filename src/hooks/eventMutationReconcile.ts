import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { CalendarEvent } from '@/types';

/**
 * Local-cache reconciliation for optimistic event mutations.
 *
 * Event lists live in React Query under one cache entry per visible/prefetched
 * month window, all sharing the key prefix `[accountId, 'events', …]` where
 * key[3]/key[4] are the window's start/end ISO strings. These helpers patch
 * those entries directly so create/edit/delete reflect instantly, with no
 * full re-fetch. They are deliberately plain functions (no hooks) so they can
 * run from the MutationCache — i.e. after the originating screen has unmounted.
 */

export type EventMutationType = 'create' | 'update' | 'delete';

export interface EventMutationMeta {
  /** Tags a mutation as one the global MutationCache should reconcile. */
  eventMutation: true;
  type: EventMutationType;
  accountId: string;
  errorTitle: string;
  // MutationMeta must be assignable to Record<string, unknown>.
  [key: string]: unknown;
}

export interface EventMutationContext {
  /** Snapshot of every events cache entry, for rollback on error. */
  previous: [QueryKey, unknown][];
  /** Create only: the placeholder uid to swap for the real event on success. */
  tempUid?: string;
  /** Recurring events are server-expanded — reconcile them with one refetch. */
  needsServerReconcile?: boolean;
}

const EVENTS = 'events';
const EVENTS_DETAIL = 'events-detail';

function eventsEntries(qc: QueryClient, accountId: string) {
  return qc.getQueriesData<CalendarEvent[]>({ queryKey: [accountId, EVENTS] });
}

/** Whether a window [key[3], key[4]] overlaps the event's span. Windowless
 *  keys (no ISO bounds) always match. */
function windowCovers(key: QueryKey, ev: CalendarEvent): boolean {
  const startISO = key[3];
  const endISO = key[4];
  if (typeof startISO !== 'string' || typeof endISO !== 'string') return true;
  const s = new Date(startISO).getTime();
  const e = new Date(endISO).getTime();
  return ev.dtend.getTime() >= s && ev.dtstart.getTime() <= e;
}

export function snapshotEvents(qc: QueryClient, accountId: string): [QueryKey, unknown][] {
  return eventsEntries(qc, accountId).map(([key, data]) => [key, data]);
}

export function rollbackEvents(qc: QueryClient, previous: [QueryKey, unknown][]): void {
  for (const [key, data] of previous) qc.setQueryData(key, data);
}

/** Insert a new event into every window that covers its date. */
export function insertEvent(qc: QueryClient, accountId: string, ev: CalendarEvent): void {
  for (const [key, data] of eventsEntries(qc, accountId)) {
    if (!Array.isArray(data)) continue;
    if (!windowCovers(key, ev)) continue;
    if (data.some((e) => e.uid === ev.uid)) continue;
    qc.setQueryData(key, [...data, ev]);
  }
}

/** Shallow-merge a patch into the matching event wherever it appears. */
export function patchEvent(
  qc: QueryClient,
  accountId: string,
  uid: string,
  patch: Partial<CalendarEvent>,
): void {
  for (const [key, data] of eventsEntries(qc, accountId)) {
    if (!Array.isArray(data)) continue;
    if (!data.some((e) => e.uid === uid)) continue;
    qc.setQueryData(key, data.map((e) => (e.uid === uid ? { ...e, ...patch } : e)));
  }
}

/** Remove the matching event wherever it appears. */
export function removeEvent(qc: QueryClient, accountId: string, uid: string): void {
  removeEventsWhere(qc, accountId, (e) => e.uid === uid);
}

/** Remove every event matching `predicate` from every window. Lets callers
 *  delete a whole recurring series, not just the tapped occurrence. */
export function removeEventsWhere(
  qc: QueryClient,
  accountId: string,
  predicate: (e: CalendarEvent) => boolean,
): void {
  for (const [key, data] of eventsEntries(qc, accountId)) {
    if (!Array.isArray(data)) continue;
    if (!data.some(predicate)) continue;
    qc.setQueryData(key, data.filter((e) => !predicate(e)));
  }
}

/** The series identity of an event. Expanded occurrences are stored as
 *  `${masterUid}_occ_${unixTime}` (see caldav-parse), so the master uid groups
 *  every occurrence of one recurring event. Non-recurring uids pass through. */
export function seriesBaseUid(uid: string): string {
  const i = uid.indexOf('_occ_');
  return i === -1 ? uid : uid.slice(0, i);
}

/** Swap an optimistic placeholder for the real server event once create
 *  resolves — remove the temp everywhere, insert the final into covering
 *  windows. Only touches entries that actually change. */
export function reconcileCreatedEvent(
  qc: QueryClient,
  accountId: string,
  tempUid: string,
  finalEvent: CalendarEvent,
): void {
  for (const [key, data] of eventsEntries(qc, accountId)) {
    if (!Array.isArray(data)) continue;
    const hadTemp = data.some((e) => e.uid === tempUid);
    const alreadyHasFinal = data.some((e) => e.uid === finalEvent.uid);
    const willAdd = windowCovers(key, finalEvent) && !alreadyHasFinal;
    if (!hadTemp && !willAdd) continue;

    const withoutTemp = hadTemp ? data.filter((e) => e.uid !== tempUid) : data;
    qc.setQueryData(key, willAdd ? [...withoutTemp, finalEvent] : withoutTemp);
  }
}

/** Single targeted refetch of an account's event windows. Used only when the
 *  server computed something we can't reproduce locally (recurring expansion /
 *  series split). Still scoped to this account's events — never global. */
export function refetchEventsTargeted(qc: QueryClient, accountId: string): void {
  qc.invalidateQueries({ queryKey: [accountId, EVENTS] });
  qc.invalidateQueries({ queryKey: [accountId, EVENTS_DETAIL] });
}
