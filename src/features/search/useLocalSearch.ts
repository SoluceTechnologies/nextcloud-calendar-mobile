import { useDeferredValue, useMemo } from 'react';

import { seriesBaseUid } from '@/database/sync';
import { useCalendarsFromDb } from '@/database/useCalendars';
import { useEventsForRange } from '@/database/useEvents';
import { useCalendarStore } from '@/stores/calendarStore';
import type { CalendarMeta } from '@/types';

import { foldText, matchesQuery, toSearchable, type SearchableEvent } from './matchEvent';
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
  matchedHrefs: Set<string>;
};

export type LocalSearchResult = LocalSearchSections & {
  query: SearchQuery;
  isEmpty: boolean;
  calendars: CalendarMeta[];
  suggestionData: SuggestionData;
};

function isBetterRepresentative(candidate: SearchableEvent, kept: SearchableEvent, now: number): boolean {
  const candidateUpcoming = candidate.end >= now;
  if (candidateUpcoming !== kept.end >= now) return candidateUpcoming;
  return candidateUpcoming ? candidate.start < kept.start : candidate.start > kept.start;
}

export function searchEvents(items: SearchableEvent[], query: SearchQuery, now: number): LocalSearchSections {
  const matchedHrefs = new Set<string>();
  if (isEmptyQuery(query)) return { upcoming: [], past: [], upcomingTotal: 0, pastTotal: 0, matchedHrefs };
  const representatives = new Map<string, SearchableEvent>();
  for (const item of items) {
    if (!matchesQuery(item, query, now)) continue;
    matchedHrefs.add(hrefPath(item.event.href));
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
    matchedHrefs,
  };
}

function cachedFold(): (text: string) => string {
  const folded = new Map<string, string>();
  return (text) => {
    let value = folded.get(text);
    if (value === undefined) {
      value = foldText(text);
      folded.set(text, value);
    }
    return value;
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
    const fold = cachedFold();
    const items: SearchableEvent[] = [];
    for (const event of rows) {
      const calendarName = nameById.get(event.calendarId);
      if (calendarName !== undefined) items.push(toSearchable(event, calendarName, fold));
    }
    return items;
  }, [rows, calendars]);

  const suggestionData = useMemo<SuggestionData>(() => {
    const people = new Map<string, SuggestionData['people'][number]>();
    for (const item of searchable) {
      for (const attendee of item.event.attendees) {
        const email = attendee.email.toLowerCase();
        if (!people.has(email)) people.set(email, { email: attendee.email, displayName: attendee.displayName });
      }
    }
    return {
      calendars: calendars.map((calendar) => ({ name: calendar.displayName, color: calendar.color })),
      people: [...people.values()],
    };
  }, [calendars, searchable]);

  const sections = useMemo(() => searchEvents(searchable, query, Date.now()), [searchable, query]);

  return useMemo(
    () => ({ ...sections, query, isEmpty: isEmptyQuery(query), calendars, suggestionData }),
    [sections, query, calendars, suggestionData],
  );
}
