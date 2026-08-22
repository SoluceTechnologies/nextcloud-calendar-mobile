import { seriesBaseUid } from '@/database/sync';
import type { CalendarEvent } from '@/types';

export function occurrenceSlot(event: Pick<CalendarEvent, 'recurrenceId' | 'dtstart'>): Date {
  return event.recurrenceId ?? event.dtstart;
}

export function exceptionResourceUid(
  event: Pick<CalendarEvent, 'uid' | 'recurrenceId' | 'dtstart'>,
): string {
  return `${seriesBaseUid(event.uid)}-exc-${occurrenceSlot(event).getTime()}`;
}
