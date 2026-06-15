import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { CalendarEvent } from '@/types';

export type EventMutationType = 'create' | 'update' | 'delete';

export interface EventMutationMeta {
  eventMutation: true;
  type: EventMutationType;
  accountId: string;
  errorTitle: string;
  [key: string]: unknown;
}

export interface EventMutationContext {
  previous: [QueryKey, unknown][];
  tempUid?: string;
  needsServerReconcile?: boolean;
}

const EVENTS = 'events';
const EVENTS_DETAIL = 'events-detail';

function eventsEntries(qc: QueryClient, accountId: string) {
  return qc.getQueriesData<CalendarEvent[]>({ queryKey: [accountId, EVENTS] });
}

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

export function insertEvent(qc: QueryClient, accountId: string, ev: CalendarEvent): void {
  for (const [key, data] of eventsEntries(qc, accountId)) {
    if (!Array.isArray(data)) continue;
    if (!windowCovers(key, ev)) continue;
    if (data.some((e) => e.uid === ev.uid)) continue;
    qc.setQueryData(key, [...data, ev]);
  }
}

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

export function removeEvent(qc: QueryClient, accountId: string, uid: string): void {
  removeEventsWhere(qc, accountId, (e) => e.uid === uid);
}

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

export function seriesBaseUid(uid: string): string {
  const i = uid.indexOf('_occ_');
  return i === -1 ? uid : uid.slice(0, i);
}

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

export function refetchEventsTargeted(qc: QueryClient, accountId: string): void {
  qc.invalidateQueries({ queryKey: [accountId, EVENTS] });
  qc.invalidateQueries({ queryKey: [accountId, EVENTS_DETAIL] });
}
