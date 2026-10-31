import { Q } from '@nozbe/watermelondb';

import type { CalendarEvent } from '@/types';
import { database } from '@/database';
import Calendar from '@/database/models/Calendar';
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
      Q.where('end', Q.gte(rangeStart)),
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

export async function readContactBirthdayCalendarIds(): Promise<Set<string>> {
  const accountId = useAccountStore.getState().activeAccountId;
  if (!accountId) return new Set();

  const rows = await database
    .get<Calendar>('calendars')
    .query(Q.where('account_id', accountId))
    .fetch();

  return new Set(
    rows
      .filter((calendar) =>
        [calendar.remoteId, calendar.slug, calendar.url]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes('contact_birthdays')),
      )
      .map((calendar) => calendar.remoteId),
  );
}

export function observeTodayEventsQuery(accountId: string, now: Date = new Date()) {
  return eventsInRangeQuery(accountId, startOfDay(now), endOfDayAfter(now, 0));
}

export function observeAgendaEventsQuery(accountId: string, days: number, now: Date = new Date()) {
  return eventsInRangeQuery(accountId, startOfDay(now), endOfDayAfter(now, days));
}

// The month widget grid covers up to ~41 days back (week-start padding at the
// end of a month) and ~42 days ahead, so a ±45-day rolling window around today
// catches edits anywhere on the currently displayed month regardless of the
// configured first day of week.
export function observeMonthWidgetEventsQuery(accountId: string, now: Date = new Date()) {
  const pad = 45 * 86_400_000;
  return eventsInRangeQuery(accountId, startOfDay(now) - pad, endOfDayAfter(now, 45));
}
