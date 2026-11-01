import dayjs from 'dayjs';
import type { CalendarEvent } from '@/types';
import { dayKey } from './grid';

export const MONTH_NUMBER_AREA = 26;
export const MONTH_LINE_HEIGHT = 16;
export const MONTH_CHIP_HEIGHT = 14;

export function buildMonthGrid(year: number, month: number, weekStartsOn: 0 | 1): (dayjs.Dayjs | null)[][] {
  const firstOfMonth = dayjs(new Date(year, month, 1));

  const offset = (firstOfMonth.day() - weekStartsOn + 7) % 7;

  const rows: (dayjs.Dayjs | null)[][] = [];
  let cursor = firstOfMonth.subtract(offset, 'day');
  for (let row = 0; row < 6; row++) {
    const week: (dayjs.Dayjs | null)[] = [];
    for (let col = 0; col < 7; col++) {
      week.push(cursor.month() === month ? cursor : null);
      cursor = cursor.add(1, 'day');
    }
    const allNull = week.every((d) => d === null);
    if (allNull) break;
    rows.push(week);
    if (cursor.month() !== month && row >= 3) break;
  }
  return rows;
}

// Same rows as buildMonthGrid, with the adjacent-month days filled in.
export function monthWeeks(year: number, month: number, weekStartsOn: 0 | 1): Date[][] {
  return buildMonthGrid(year, month, weekStartsOn).map((week) => {
    const i = week.findIndex((d) => d !== null);
    const first = week[i]!;
    return Array.from({ length: 7 }, (_, k) =>
      new Date(first.year(), first.month(), first.date() - i + k));
  });
}

export function linesFor(rowHeight: number): number {
  return Math.max(1, Math.floor((rowHeight - MONTH_NUMBER_AREA) / MONTH_LINE_HEIGHT));
}

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
// One loaded range (3 months) of a heavy account must fit, or the cache thrashes.
const EVENT_DAY_KEYS_CACHE_LIMIT = 2000;

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

export interface WeekSegment {
  event: CalendarEvent;
  col0: number;
  col1: number;
  lane: number;
  continuesLeft: boolean;
  continuesRight: boolean;
}

export interface WeekLayout {
  segments: WeekSegment[];
  more: { col: number; count: number }[];
}

interface Item {
  event: CalendarEvent;
  col0: number;
  col1: number;
  isBar: boolean;
  startsBefore: boolean;
  endsAfter: boolean;
  lane: number;
}

function byStartThenTitle(a: Item, b: Item): number {
  return a.event.dtstart.getTime() - b.event.dtstart.getTime()
    || a.event.summary.localeCompare(b.event.summary);
}

// Bars (all-day or multi-day) take lanes first, longest first; timed chips then
// fill the lowest free lane of their day. A day with more items than `lines`
// keeps its last line for "+N".
export function layoutWeek(days: Date[], events: CalendarEvent[], lines: number): WeekLayout {
  const keys = days.map(dayKey);
  const firstKey = keys[0];
  const lastKey = keys[keys.length - 1];

  const items: Item[] = [];
  for (const event of events) {
    const eventKeys = eventDayKeys(event);
    if (eventKeys[eventKeys.length - 1] < firstKey || eventKeys[0] > lastKey) continue;
    let col0 = -1;
    let col1 = -1;
    keys.forEach((k, col) => {
      if (k >= eventKeys[0] && k <= eventKeys[eventKeys.length - 1]) {
        if (col0 < 0) col0 = col;
        col1 = col;
      }
    });
    if (col0 < 0) continue;
    items.push({
      event, col0, col1,
      isBar: event.allDay || eventKeys.length > 1,
      startsBefore: eventKeys[0] < firstKey,
      endsAfter: eventKeys[eventKeys.length - 1] > lastKey,
      lane: 0,
    });
  }

  const bars = items.filter((i) => i.isBar)
    .sort((a, b) => a.col0 - b.col0 || (b.col1 - b.col0) - (a.col1 - a.col0) || byStartThenTitle(a, b));
  const chips = items.filter((i) => !i.isBar).sort(byStartThenTitle);

  const occupied: boolean[][] = keys.map(() => []);
  for (const item of [...bars, ...chips]) {
    let lane = 0;
    const taken = (l: number) => {
      for (let c = item.col0; c <= item.col1; c++) if (occupied[c][l]) return true;
      return false;
    };
    while (taken(lane)) lane++;
    item.lane = lane;
    for (let c = item.col0; c <= item.col1; c++) occupied[c][lane] = true;
  }

  // Lanes are shared across the week, so a day can have a gap under a bar: what
  // decides overflow is its highest used lane, not its item count. Otherwise
  // "+N" could land on a line a visible chip still uses.
  const limit = occupied.map((lanes) => (lanes.length > lines ? lines - 1 : lines));
  const hidden = keys.map(() => 0);
  const segments: WeekSegment[] = [];
  for (const item of [...bars, ...chips]) {
    let runStart = -1;
    const close = (end: number) => {
      segments.push({
        event: item.event,
        col0: runStart,
        col1: end,
        lane: item.lane,
        continuesLeft: runStart > item.col0 || item.startsBefore,
        continuesRight: end < item.col1 || item.endsAfter,
      });
      runStart = -1;
    };
    for (let c = item.col0; c <= item.col1; c++) {
      if (item.lane < limit[c]) {
        if (runStart < 0) runStart = c;
      } else {
        hidden[c]++;
        if (runStart >= 0) close(c - 1);
      }
    }
    if (runStart >= 0) close(item.col1);
  }

  const more = hidden.flatMap((n, col) => (n > 0 ? [{ col, count: n }] : []));
  return { segments, more };
}
