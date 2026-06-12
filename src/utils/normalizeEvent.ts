import type { CalendarEvent } from '@/types';

/**
 * React Query serializes cached data as JSON (AsyncStorage persister).
 * Date objects survive as ISO strings and must be coerced back on restore.
 * Call this on any CalendarEvent[] read from cache or received from queryFn.
 */
export function normalizeEvent(e: CalendarEvent): CalendarEvent {
  // Fast path: events straight from the queryFn already hold Date objects.
  // Only cache-restored events (ISO strings) need coercion. Skipping the
  // object spread here avoids churning allocations on every render.
  if (e.dtstart instanceof Date && e.dtend instanceof Date) return e;
  return {
    ...e,
    dtstart: e.dtstart instanceof Date ? e.dtstart : new Date(e.dtstart as unknown as string),
    dtend:   e.dtend   instanceof Date ? e.dtend   : new Date(e.dtend   as unknown as string),
  };
}

export function normalizeEvents(events: CalendarEvent[]): CalendarEvent[] {
  // Preserve referential identity when nothing needed coercion, so downstream
  // useMemo/dependency checks don't see a new array each call.
  let changed = false;
  const out = events.map((e) => {
    const n = normalizeEvent(e);
    if (n !== e) changed = true;
    return n;
  });
  return changed ? out : events;
}
