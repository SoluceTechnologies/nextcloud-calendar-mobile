import type { CalendarEvent } from '@/types';

import { dayKey } from './grid';

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function lastDayOf(e: CalendarEvent): Date {
  const end = startOfDay(e.dtend);
  if (e.allDay) return end;
  const exactMidnight =
    e.dtend.getHours() === 0 &&
    e.dtend.getMinutes() === 0 &&
    e.dtend.getSeconds() === 0 &&
    e.dtend.getMilliseconds() === 0;
  if (exactMidnight) {
    return new Date(end.getTime() - 1);
  }
  return end;
}

const EVENT_DAY_KEYS_CACHE = new Map<string, string[]>();
const EVENT_DAY_KEYS_CACHE_LIMIT = 200;

function cacheKeyFor(e: CalendarEvent): string {
  return `${e.uid}:${e.calendarId}:${e.dtstart.getTime()}:${e.dtend.getTime()}:${e.allDay}`;
}

export function eventDayKeys(e: CalendarEvent): string[] {
  const key = cacheKeyFor(e);
  const cached = EVENT_DAY_KEYS_CACHE.get(key);
  if (cached) return cached;

  const start = startOfDay(e.dtstart);
  const end = lastDayOf(e);
  const keys: string[] = [];
  let cur = start;
  const limit = 366;
  while (cur.getTime() <= end.getTime() && keys.length <= limit) {
    keys.push(dayKey(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }

  const result = keys.length ? keys : [dayKey(start)];

  if (EVENT_DAY_KEYS_CACHE.size >= EVENT_DAY_KEYS_CACHE_LIMIT) {
    const first = EVENT_DAY_KEYS_CACHE.keys().next().value;
    if (first !== undefined) EVENT_DAY_KEYS_CACHE.delete(first);
  }
  EVENT_DAY_KEYS_CACHE.set(key, result);

  return result;
}

export function eventCoversDay(e: CalendarEvent, key: string): boolean {
  const startKey = dayKey(startOfDay(e.dtstart));
  const end = lastDayOf(e);
  const endKey = dayKey(end);
  return key >= startKey && key <= (endKey < startKey ? startKey : endKey);
}
