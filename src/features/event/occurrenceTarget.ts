import type { CalendarEvent } from '@/types';

export function occurrenceSlot(event: Pick<CalendarEvent, 'recurrenceId' | 'dtstart'>): Date {
  return event.recurrenceId ?? event.dtstart;
}
