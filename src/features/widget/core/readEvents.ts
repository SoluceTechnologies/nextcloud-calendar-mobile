import { Q } from '@nozbe/watermelondb';

import type { CalendarEvent } from '@/types';
import { database } from '@/database';
import Event from '@/database/models/Event';
import { mapEventToShared } from '@/database/mappers/event';
import { useAccountStore } from '@/stores/accountStore';
import { useCalendarStore } from '@/stores/calendarStore';
import { normalizeEvents } from '@/utils/normalizeEvent';

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function endOfDayAfter(d: Date, days: number): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days + 1).getTime();
}

function eventsInRangeQuery(accountIds: string | string[], rangeStart: number, rangeEnd: number) {
  const ids = Array.isArray(accountIds) ? accountIds : [accountIds];
  return database
    .get<Event>('events')
    .query(
      Q.where('account_id', Q.oneOf(ids)),
      Q.where('start', Q.lt(rangeEnd)),
      Q.where('end', Q.gte(rangeStart)),
    );
}

export async function readUpcomingEvents(days: number, now: Date = new Date(), accountIds?: string[]): Promise<CalendarEvent[]> {
  const ids = accountIds ?? [useAccountStore.getState().activeAccountId ?? ''];
  const validIds = ids.filter(Boolean);
  if (validIds.length === 0) return [];

  const hidden = useCalendarStore.getState().hiddenCalendarIds;
  const rows = await eventsInRangeQuery(validIds, startOfDay(now), endOfDayAfter(now, days)).fetch();

  return normalizeEvents(
    rows
      .map(mapEventToShared)
      .filter((e) => !hidden.includes(e.calendarId)),
  );
}

export function observeTodayEventsQuery(accountIds: string | string[], now: Date = new Date()) {
  return eventsInRangeQuery(accountIds, startOfDay(now), endOfDayAfter(now, 0));
}

export function observeAgendaEventsQuery(accountIds: string | string[], days: number, now: Date = new Date()) {
  return eventsInRangeQuery(accountIds, startOfDay(now), endOfDayAfter(now, days));
}
