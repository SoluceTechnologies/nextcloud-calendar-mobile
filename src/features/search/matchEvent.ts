import dayjs from 'dayjs';

import type { CalendarEvent } from '@/types';

import type { DateTerm, SearchQuery } from './parseQuery';

export type SearchableEvent = {
  event: CalendarEvent;
  title: string;
  location: string;
  description: string;
  calendarName: string;
  attendees: string[];
  start: number;
  end: number;
};

const DAY_MS = 86_400_000;
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const foldedQueries = new WeakMap<SearchQuery, SearchQuery>();

export function foldText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase();
}

export function toSearchable(event: CalendarEvent, calendarName: string): SearchableEvent {
  return {
    event,
    title: foldText(event.summary ?? ''),
    location: foldText(event.location ?? ''),
    description: foldText(event.description ?? ''),
    calendarName: foldText(calendarName),
    attendees: event.attendees
      .flatMap((attendee) => [attendee.displayName ?? '', attendee.email])
      .filter((value) => value.length > 0)
      .map(foldText),
    start: event.dtstart.getTime(),
    end: event.allDay ? dayjs(event.dtend).endOf('day').valueOf() : event.dtend.getTime(),
  };
}

export function overlaps(item: SearchableEvent, rangeStart: number, rangeEnd: number): boolean {
  return item.start <= rangeEnd && (item.end > rangeStart || item.start >= rangeStart);
}

function foldQuery(query: SearchQuery): SearchQuery {
  let folded = foldedQueries.get(query);
  if (!folded) {
    folded = {
      title: query.title.map(foldText),
      description: query.description.map(foldText),
      location: query.location.map(foldText),
      calendar: query.calendar.map(foldText),
      attendee: query.attendee.map(foldText),
      date: query.date,
      text: query.text.map(foldText),
    };
    foldedQueries.set(query, folded);
  }
  return folded;
}

function contains(haystack: string, needle: string): boolean {
  return needle.length > 0 && haystack.includes(needle);
}

function anyContains(haystacks: string[], needle: string): boolean {
  return haystacks.some((haystack) => contains(haystack, needle));
}

function dayIndex(milliseconds: number): number {
  const day = new Date(milliseconds);
  day.setHours(0, 0, 0, 0);
  return Math.round(day.getTime() / DAY_MS);
}

function parseDay(value: string): Date | null {
  const match = DAY_PATTERN.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

function overlapsDay(item: SearchableEvent, day: dayjs.Dayjs): boolean {
  return overlaps(item, day.startOf('day').valueOf(), day.endOf('day').valueOf());
}

function matchesPreset(item: SearchableEvent, preset: string, now: number): boolean | null {
  const today = dayjs(now);
  switch (preset) {
    case 'today': return overlapsDay(item, today);
    case 'tomorrow': return overlapsDay(item, today.add(1, 'day'));
    case 'week': return overlaps(item, now, today.add(7, 'day').valueOf());
    case 'month': return overlaps(item, now, today.add(1, 'month').valueOf());
    case 'upcoming': return item.end >= now;
    case 'past': return item.end < now;
    default: return null;
  }
}

function matchesDate(item: SearchableEvent, term: DateTerm, now: number): boolean {
  const preset = matchesPreset(item, term.value, now);
  if (preset !== null) return preset;
  const day = parseDay(term.value);
  if (!day) return false;
  const wanted = dayIndex(day.getTime());
  const start = dayIndex(item.start);
  switch (term.comparator) {
    case '<': return start < wanted;
    case '<=': return start <= wanted;
    case '>': return start > wanted;
    case '>=': return start >= wanted;
    default: return overlapsDay(item, dayjs(day));
  }
}

function matchesAnyField(item: SearchableEvent, needle: string): boolean {
  return (
    contains(item.title, needle) ||
    contains(item.location, needle) ||
    contains(item.description, needle) ||
    contains(item.calendarName, needle) ||
    anyContains(item.attendees, needle)
  );
}

export function matchesQuery(item: SearchableEvent, query: SearchQuery, now: number): boolean {
  const folded = foldQuery(query);
  return (
    folded.title.every((needle) => contains(item.title, needle)) &&
    folded.location.every((needle) => contains(item.location, needle)) &&
    folded.description.every((needle) => contains(item.description, needle)) &&
    folded.calendar.every((needle) => contains(item.calendarName, needle)) &&
    folded.attendee.every((needle) => anyContains(item.attendees, needle)) &&
    folded.text.every((needle) => matchesAnyField(item, needle)) &&
    folded.date.every((term) => matchesDate(item, term, now))
  );
}
