import { useDeferredValue, useMemo } from 'react';

import { seriesBaseUid } from '@/database/sync';
import { useCalendarsFromDb } from '@/database/useCalendars';
import { useEventsForRange } from '@/database/useEvents';
import { useCalendarStore } from '@/stores/calendarStore';
import type { CalendarMeta } from '@/types';

import { matchesQuery, toSearchable, type SearchableEvent } from './matchEvent';
import { isEmptyQuery, parseQuery, type SearchQuery } from './parseQuery';
import { hrefPath } from './serverSearch';
import type { SuggestionData } from './suggestions';

export const MAX_RESULTS = 50;

const MIN_DATE = new Date(-8.64e15);
const MAX_DATE = new Date(8.64e15);

export type LocalSearchSections = {
  upcoming: SearchableEvent[];
  past: SearchableEvent[];
  upcomingTotal: number;
  pastTotal: number;
};

export type LocalSearchResult = LocalSearchSections & {
  query: SearchQuery;
  isEmpty: boolean;
  knownHrefs: Set<string>;
  calendars: CalendarMeta[];
  suggestionData: SuggestionData;
};

function isBetterRepresentative(candidate: SearchableEvent, kept: SearchableEvent, now: number): boolean {
  const candidateUpcoming = candidate.end >= now;
  if (candidateUpcoming !== kept.end >= now) return candidateUpcoming;
  return candidateUpcoming ? candidate.start < kept.start : candidate.start > kept.start;
}

export function searchEvents(items: SearchableEvent[], query: SearchQuery, now: number): LocalSearchSections {
  if (isEmptyQuery(query)) return { upcoming: [], past: [], upcomingTotal: 0, pastTotal: 0 };
  const representatives = new Map<string, SearchableEvent>();
  for (const item of items) {
    if (!matchesQuery(item, query, now)) continue;
    const seriesKey = `${item.event.calendarId}|${seriesBaseUid(item.event.uid)}`;
    const kept = representatives.get(seriesKey);
    if (!kept || isBetterRepresentative(item, kept, now)) representatives.set(seriesKey, item);
  }
  const upcoming: SearchableEvent[] = [];
  const past: SearchableEvent[] = [];
  for (const item of representatives.values()) (item.end >= now ? upcoming : past).push(item);
  upcoming.sort((first, second) => first.start - second.start);
  past.sort((first, second) => second.start - first.start);
  return {
    upcoming: upcoming.slice(0, MAX_RESULTS),
    past: past.slice(0, MAX_RESULTS),
    upcomingTotal: upcoming.length,
    pastTotal: past.length,
  };
}

export function useLocalSearch(accountId: string | null, term: string): LocalSearchResult {
  const deferredTerm = useDeferredValue(term);
  const query = useMemo(() => parseQuery(deferredTerm), [deferredTerm]);
  const rows = useEventsForRange(accountId ?? '', MIN_DATE, MAX_DATE);
  const accountCalendars = useCalendarsFromDb(accountId);
  const hiddenCalendarIds = useCalendarStore((state) => state.hiddenCalendarIds);

  const calendars = useMemo(
    () => accountCalendars.filter((calendar) => !hiddenCalendarIds.includes(calendar.id)),
    [accountCalendars, hiddenCalendarIds],
  );

  const searchable = useMemo(() => {
    const nameById = new Map(calendars.map((calendar) => [calendar.id, calendar.displayName]));
    const items: SearchableEvent[] = [];
    for (const event of rows) {
      const calendarName = nameById.get(event.calendarId);
      if (calendarName !== undefined) items.push(toSearchable(event, calendarName));
    }
    return items;
  }, [rows, calendars]);

  const knownHrefs = useMemo(() => new Set(rows.map((event) => hrefPath(event.href))), [rows]);

  const suggestionData = useMemo<SuggestionData>(
    () => ({
      calendars: calendars.map((calendar) => ({ name: calendar.displayName, color: calendar.color })),
      people: searchable.flatMap((item) =>
        item.event.attendees.map((attendee) => ({ email: attendee.email, displayName: attendee.displayName })),
      ),
    }),
    [calendars, searchable],
  );

  const sections = useMemo(() => searchEvents(searchable, query, Date.now()), [searchable, query]);

  return { ...sections, query, isEmpty: isEmptyQuery(query), knownHrefs, calendars, suggestionData };
}
