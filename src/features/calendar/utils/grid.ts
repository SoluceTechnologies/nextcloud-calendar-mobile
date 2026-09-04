import dayjs from 'dayjs';
import type { CalMode } from '../constants';
import type { GridEvent } from './toGridEvents';
import type { CalendarEvent } from '@/types';

export const HOUR_RAIL_WIDTH = 50;
export const DAY_HEADER_HEIGHT = 66;
export const ALL_DAY_CHIP_HEIGHT = 18;
export const ALL_DAY_CHIP_GAP = 4;
export const ALL_DAY_ROW_HEIGHT = ALL_DAY_CHIP_HEIGHT + ALL_DAY_CHIP_GAP;
export const ALL_DAY_PAD = 4;

export function daysPerPage(mode: CalMode): number {
  return mode === 'week' ? 7 : mode === '3days' ? 3 : 1;
}

export function dayKey(d: Date): string {
  // Raw local-time formatting rather than dayjs: this runs per event slice in
  // buildDayIndex and per column in render, so a dayjs object per call showed up
  // as hundreds of ms on a busy month. Same YYYY-MM-DD result.
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${m < 10 ? `0${m}` : m}-${day < 10 ? `0${day}` : day}`;
}

function weekStartOffset(subjectDow: number, weekStartsOn: 0 | 1): number {
  return -(subjectDow < weekStartsOn ? 7 + subjectDow : subjectDow) + weekStartsOn;
}

export function pageDates(
  anchor: Date,
  index: number,
  mode: CalMode,
  weekStartsOn: 0 | 1,
): Date[] {
  const span = daysPerPage(mode);
  const shifted = dayjs(anchor).add(index * span, 'day');
  const first =
    mode === 'week'
      ? shifted.add(weekStartOffset(shifted.day(), weekStartsOn), 'day')
      : shifted;
  return Array.from({ length: span }, (_, i) => first.add(i, 'day').startOf('day').toDate());
}

export function pageFocusDate(
  anchor: Date,
  index: number,
  mode: CalMode,
  weekStartsOn: 0 | 1,
): Date {
  const dates = pageDates(anchor, index, mode, weekStartsOn);
  const anchorKey = dayKey(anchor);
  return dates.some((d) => dayKey(d) === anchorKey) ? anchor : dates[0];
}

export function pageIndexForDate(
  anchor: Date,
  target: Date,
  mode: CalMode,
  weekStartsOn: 0 | 1,
): number {
  const span = daysPerPage(mode);
  const startOfPage = (d: Date) => {
    const day = dayjs(d).startOf('day');
    return mode === 'week' ? day.add(weekStartOffset(day.day(), weekStartsOn), 'day') : day;
  };
  const from = startOfPage(anchor);
  const to = startOfPage(target);
  return Math.floor(to.diff(from, 'day') / span);
}

function sameSlice(a: GridEvent, b: GridEvent): boolean {
  if (a === b) return true;
  return (
    a._event.uid === b._event.uid &&
    a.start.getTime() === b.start.getTime() &&
    a.end.getTime() === b.end.getTime() &&
    a.title === b.title &&
    a.color === b.color
  );
}

export function stabilizeDayIndex(
  next: Map<string, GridEvent[]>,
  prev: Map<string, GridEvent[]>,
): Map<string, GridEvent[]> {
  for (const [key, slices] of next) {
    const before = prev.get(key);
    if (!before || before.length !== slices.length) continue;
    let identical = true;
    for (let i = 0; i < slices.length; i++) {
      if (!sameSlice(before[i], slices[i])) {
        identical = false;
        break;
      }
    }
    if (identical) next.set(key, before);
  }
  return next;
}

const DAY_MINUTES = 1440;

function minutesFromMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function nowTopPct(now: Date): number {
  return (100 * minutesFromMidnight(now)) / DAY_MINUTES;
}

export function eventPositionStyle(start: Date, end: Date): { top: string; height: string } {
  const durationInMinutes = dayjs(end).diff(start, 'minute');
  return {
    top: `${nowTopPct(start)}%`,
    height: `${100 * (1 / DAY_MINUTES) * durationInMinutes}%`,
  };
}

const DAY_INDEX_CACHE = new Map<string, Map<string, GridEvent[]>>();
const DAY_INDEX_CACHE_LIMIT = 8;

function dayIndexKey(events: GridEvent[]): string {
  // Content-based key: cheap enough to compute and stable for the same set of
  // underlying events even when GridEvent objects are recreated.
  let hash = '';
  for (const e of events) {
    hash += `${e._event.uid},${e.start.getTime()},${e.end.getTime()},${e.title},${e.color};`;
  }
  return hash;
}

export function buildDayIndex(events: GridEvent[]): Map<string, GridEvent[]> {
  const key = dayIndexKey(events);
  const cached = DAY_INDEX_CACHE.get(key);
  if (cached) return cached;

  const index = new Map<string, GridEvent[]>();

  const push = (key: string, slice: GridEvent) => {
    const bucket = index.get(key);
    if (bucket) bucket.push(slice);
    else index.set(key, [slice]);
  };

  for (const event of events) {
    if (event._event.allDay) continue;

    // Raw Date/timestamp arithmetic, no dayjs: this runs over every event in
    // the visible month on each mutation, and a handful of dayjs objects per
    // event was the bulk of the ~500ms lag felt when dropping a dragged event
    // on a busy calendar. Day boundaries use local midnight, as dayjs's
    // startOf('day') did, so DST and month rollover are handled by the Date
    // constructor.
    const startMs = event.start.getTime();
    const endMs = event.end.getTime();
    let dayStart = new Date(event.start.getFullYear(), event.start.getMonth(), event.start.getDate());
    const firstNextMs = new Date(
      dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1,
    ).getTime();

    // Fast path — the common single-day event: no slice allocation, no loop.
    if (endMs <= firstNextMs) {
      push(dayKey(dayStart), event);
      continue;
    }

    while (dayStart.getTime() < endMs) {
      const nextMs = new Date(
        dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1,
      ).getTime();
      const sliceStartMs = startMs > dayStart.getTime() ? startMs : dayStart.getTime();
      const sliceEndMs = endMs < nextMs ? endMs : nextMs;

      if (sliceStartMs < sliceEndMs) {
        const slice: GridEvent =
          sliceStartMs === startMs && sliceEndMs === endMs
            ? event
            : { ...event, start: new Date(sliceStartMs), end: new Date(sliceEndMs) };
        push(dayKey(dayStart), slice);
      }

      dayStart = new Date(nextMs);
    }
  }

  if (DAY_INDEX_CACHE.size >= DAY_INDEX_CACHE_LIMIT) {
    const first = DAY_INDEX_CACHE.keys().next().value;
    if (first !== undefined) DAY_INDEX_CACHE.delete(first);
  }
  DAY_INDEX_CACHE.set(key, index);

  return index;
}

export function allDayEventsForDay(date: Date, allDayEvents: CalendarEvent[]): CalendarEvent[] {
  const day = dayjs(date).startOf('day');
  return allDayEvents.filter((event) => {
    const start = dayjs(event.dtstart).startOf('day');
    const end = dayjs(event.dtend).startOf('day');
    return !day.isBefore(start) && !day.isAfter(end);
  });
}

export function allDayRowHeight(dates: Date[], allDayEvents: CalendarEvent[]): number {
  if (allDayEvents.length === 0) return 0;
  let maxPerDay = 0;
  for (const date of dates) {
    const count = allDayEventsForDay(date, allDayEvents).length;
    if (count > maxPerDay) maxPerDay = count;
  }
  return maxPerDay === 0 ? 0 : maxPerDay * ALL_DAY_ROW_HEIGHT + ALL_DAY_PAD;
}
