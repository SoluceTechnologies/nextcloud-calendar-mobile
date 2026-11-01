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
    for (let column = 0; column < 7; column++) {
      week.push(cursor.month() === month ? cursor : null);
      cursor = cursor.add(1, 'day');
    }
    const allNull = week.every((day) => day === null);
    if (allNull) break;
    rows.push(week);
    if (cursor.month() !== month && row >= 3) break;
  }
  return rows;
}

export function monthWeeks(year: number, month: number, weekStartsOn: 0 | 1): Date[][] {
  return buildMonthGrid(year, month, weekStartsOn).map((week) => {
    const firstInMonthColumn = week.findIndex((day) => day !== null);
    const firstInMonth = week[firstInMonthColumn]!;
    return Array.from({ length: 7 }, (_, column) => new Date(
      firstInMonth.year(),
      firstInMonth.month(),
      firstInMonth.date() - firstInMonthColumn + column,
    ));
  });
}

export function linesFor(rowHeight: number): number {
  return Math.max(1, Math.floor((rowHeight - MONTH_NUMBER_AREA) / MONTH_LINE_HEIGHT));
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function lastDayOf(event: CalendarEvent): Date {
  const end = startOfDay(event.dtend);
  if (event.allDay) return end;
  const exactMidnight =
    event.dtend.getHours() === 0 &&
    event.dtend.getMinutes() === 0 &&
    event.dtend.getSeconds() === 0 &&
    event.dtend.getMilliseconds() === 0;
  if (exactMidnight) {
    return new Date(end.getTime() - 1);
  }
  return end;
}

const EVENT_DAY_KEYS_CACHE = new Map<string, string[]>();
const EVENT_DAY_KEYS_CACHE_LIMIT = 2000;

function cacheKeyFor(event: CalendarEvent): string {
  return `${event.uid}:${event.calendarId}:${event.dtstart.getTime()}:${event.dtend.getTime()}:${event.allDay}`;
}

export function eventDayKeys(event: CalendarEvent): string[] {
  const key = cacheKeyFor(event);
  const cached = EVENT_DAY_KEYS_CACHE.get(key);
  if (cached) return cached;

  const start = startOfDay(event.dtstart);
  const end = lastDayOf(event);
  const keys: string[] = [];
  let current = start;
  const limit = 366;
  while (current.getTime() <= end.getTime() && keys.length <= limit) {
    keys.push(dayKey(current));
    current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
  }

  const result = keys.length ? keys : [dayKey(start)];

  if (EVENT_DAY_KEYS_CACHE.size >= EVENT_DAY_KEYS_CACHE_LIMIT) {
    const oldest = EVENT_DAY_KEYS_CACHE.keys().next().value;
    if (oldest !== undefined) EVENT_DAY_KEYS_CACHE.delete(oldest);
  }
  EVENT_DAY_KEYS_CACHE.set(key, result);

  return result;
}

export function eventCoversDay(event: CalendarEvent, key: string): boolean {
  const startKey = dayKey(startOfDay(event.dtstart));
  const end = lastDayOf(event);
  const endKey = dayKey(end);
  return key >= startKey && key <= (endKey < startKey ? startKey : endKey);
}

export interface WeekSegment {
  event: CalendarEvent;
  startColumn: number;
  endColumn: number;
  lane: number;
  continuesLeft: boolean;
  continuesRight: boolean;
}

export interface WeekOverflow {
  column: number;
  count: number;
}

export interface WeekLayout {
  segments: WeekSegment[];
  overflows: WeekOverflow[];
}

interface WeekItem {
  event: CalendarEvent;
  startColumn: number;
  endColumn: number;
  isBar: boolean;
  startsBeforeWeek: boolean;
  endsAfterWeek: boolean;
  lane: number;
}

function byStartThenTitle(first: WeekItem, second: WeekItem): number {
  return first.event.dtstart.getTime() - second.event.dtstart.getTime()
    || first.event.summary.localeCompare(second.event.summary);
}

function byStartColumnThenLongest(first: WeekItem, second: WeekItem): number {
  const firstSpan = first.endColumn - first.startColumn;
  const secondSpan = second.endColumn - second.startColumn;
  return first.startColumn - second.startColumn
    || secondSpan - firstSpan
    || byStartThenTitle(first, second);
}

export function layoutWeek(days: Date[], events: CalendarEvent[], lines: number): WeekLayout {
  const weekKeys = days.map(dayKey);
  const firstWeekKey = weekKeys[0];
  const lastWeekKey = weekKeys[weekKeys.length - 1];

  const items: WeekItem[] = [];
  for (const event of events) {
    const eventKeys = eventDayKeys(event);
    const firstEventKey = eventKeys[0];
    const lastEventKey = eventKeys[eventKeys.length - 1];
    if (lastEventKey < firstWeekKey || firstEventKey > lastWeekKey) continue;
    let startColumn = -1;
    let endColumn = -1;
    weekKeys.forEach((weekKey, column) => {
      if (weekKey >= firstEventKey && weekKey <= lastEventKey) {
        if (startColumn < 0) startColumn = column;
        endColumn = column;
      }
    });
    if (startColumn < 0) continue;
    items.push({
      event,
      startColumn,
      endColumn,
      isBar: event.allDay || eventKeys.length > 1,
      startsBeforeWeek: firstEventKey < firstWeekKey,
      endsAfterWeek: lastEventKey > lastWeekKey,
      lane: 0,
    });
  }

  const bars = items.filter((item) => item.isBar).sort(byStartColumnThenLongest);
  const chips = items.filter((item) => !item.isBar).sort(byStartThenTitle);
  const orderedItems = [...bars, ...chips];

  const occupiedLanes: boolean[][] = weekKeys.map(() => []);
  for (const item of orderedItems) {
    const isLaneTaken = (lane: number) => {
      for (let column = item.startColumn; column <= item.endColumn; column++) {
        if (occupiedLanes[column][lane]) return true;
      }
      return false;
    };
    let lane = 0;
    while (isLaneTaken(lane)) lane++;
    item.lane = lane;
    for (let column = item.startColumn; column <= item.endColumn; column++) {
      occupiedLanes[column][lane] = true;
    }
  }

  const visibleLanes = occupiedLanes.map((lanes) => (lanes.length > lines ? lines - 1 : lines));
  const hiddenCounts = weekKeys.map(() => 0);
  const segments: WeekSegment[] = [];
  for (const item of orderedItems) {
    let runStartColumn = -1;
    const closeRun = (runEndColumn: number) => {
      segments.push({
        event: item.event,
        startColumn: runStartColumn,
        endColumn: runEndColumn,
        lane: item.lane,
        continuesLeft: runStartColumn > item.startColumn || item.startsBeforeWeek,
        continuesRight: runEndColumn < item.endColumn || item.endsAfterWeek,
      });
      runStartColumn = -1;
    };
    for (let column = item.startColumn; column <= item.endColumn; column++) {
      if (item.lane < visibleLanes[column]) {
        if (runStartColumn < 0) runStartColumn = column;
      } else {
        hiddenCounts[column]++;
        if (runStartColumn >= 0) closeRun(column - 1);
      }
    }
    if (runStartColumn >= 0) closeRun(item.endColumn);
  }

  const overflows = hiddenCounts.flatMap((count, column) => (count > 0 ? [{ column, count }] : []));
  return { segments, overflows };
}
