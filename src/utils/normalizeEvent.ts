import type { CalendarEvent } from '@/types';

/**
 * React Query serializes cached data as JSON (AsyncStorage persister).
 * Date objects survive as ISO strings and must be coerced back on restore.
 * Call this on any CalendarEvent[] read from cache or received from queryFn.
 */
export function normalizeEvent(e: CalendarEvent): CalendarEvent {
  return {
    ...e,
    dtstart: e.dtstart instanceof Date ? e.dtstart : new Date(e.dtstart as unknown as string),
    dtend:   e.dtend   instanceof Date ? e.dtend   : new Date(e.dtend   as unknown as string),
  };
}

export function normalizeEvents(events: CalendarEvent[]): CalendarEvent[] {
  return events.map(normalizeEvent);
}
