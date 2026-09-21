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

function eventsInRangeQuery(accountId: string, rangeStart: number, rangeEnd: number) {
  return database
    .get<Event>('events')
    .query(
      Q.where('account_id', accountId),
      Q.where('start', Q.lt(rangeEnd)),
      Q.where('end', Q.gt(rangeStart)),
    );
}

export async function readUpcomingEvents(days: number, now: Date = new Date()): Promise<CalendarEvent[]> {
  const accountId = useAccountStore.getState().activeAccountId;
  if (!accountId) return [];

  const hidden = useCalendarStore.getState().hiddenCalendarIds;
  const rows = await eventsInRangeQuery(accountId, startOfDay(now), endOfDayAfter(now, days)).fetch();

  return normalizeEvents(
    rows
      .map(mapEventToShared)
      .filter((e) => !hidden.includes(e.calendarId)),
  );
}

export async function readWidgetEvents(rangeStart: Date, rangeEnd: Date): Promise<CalendarEvent[]> {
  const accountId = useAccountStore.getState().activeAccountId;
  if (!accountId) return [];

  const hidden = useCalendarStore.getState().hiddenCalendarIds;
  const disabled = useCalendarStore.getState().widgetDisabledCalendarIds;
  const rows = await eventsInRangeQuery(accountId, rangeStart.getTime(), rangeEnd.getTime()).fetch();

  return normalizeEvents(
    rows
      .map(mapEventToShared)
      .filter((event) => !hidden.includes(event.calendarId) && !disabled.includes(event.calendarId)),
  );
}

export function observeTodayEventsQuery(accountId: string, now: Date = new Date()) {
  return eventsInRangeQuery(accountId, startOfDay(now), endOfDayAfter(now, 0));
}

export function observeAgendaEventsQuery(accountId: string, days: number, now: Date = new Date()) {
  return eventsInRangeQuery(accountId, startOfDay(now), endOfDayAfter(now, days));
}
