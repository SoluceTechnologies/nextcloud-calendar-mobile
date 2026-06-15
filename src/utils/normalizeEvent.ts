import type { CalendarEvent } from '@/types';

export function normalizeEvent(e: CalendarEvent): CalendarEvent {
  if (e.dtstart instanceof Date && e.dtend instanceof Date) return e;
  return {
    ...e,
    dtstart: e.dtstart instanceof Date ? e.dtstart : new Date(e.dtstart as unknown as string),
    dtend:   e.dtend   instanceof Date ? e.dtend   : new Date(e.dtend   as unknown as string),
  };
}

export function normalizeEvents(events: CalendarEvent[]): CalendarEvent[] {
  let changed = false;
  const out = events.map((e) => {
    const n = normalizeEvent(e);
    if (n !== e) changed = true;
    return n;
  });
  return changed ? out : events;
}
