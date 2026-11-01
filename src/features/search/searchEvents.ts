import type { CalendarEvent } from '@/types';

export function normalizeSearchText(text: string | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function haystack(e: CalendarEvent): string {
  const parts: (string | undefined)[] = [
    e.summary,
    e.description,
    e.location,
    e.organizerEmail,
  ];
  for (const a of e.attendees ?? []) {
    parts.push(a.email, a.displayName);
  }
  return normalizeSearchText(parts.filter(Boolean).join(' '));
}

export function searchEvents(events: CalendarEvent[], query: string): CalendarEvent[] {
  const terms = normalizeSearchText(query).trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  return events
    .filter((e) => {
      const text = haystack(e);
      return terms.every((term) => text.includes(term));
    })
    .sort((a, b) => a.dtstart.getTime() - b.dtstart.getTime());
}
