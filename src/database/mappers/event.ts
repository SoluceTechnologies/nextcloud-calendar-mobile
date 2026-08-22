import type { Attendee, CalendarEvent } from '@/types';
import { dedupeAttendees } from '@/utils/attendees';

import Event from '../models/Event';

function parseAttendees(raw?: string): Attendee[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? dedupeAttendees(parsed as Attendee[]) : [];
  } catch {
    return [];
  }
}

export function mapEventToShared(event: Event): CalendarEvent {
  return {
    uid: event.uid,
    href: event.href,
    calendarId: event.calendarId,
    accountId: event.accountId,
    summary: event.summary,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    dtstart: new Date(event.start),
    dtend: new Date(event.end),
    allDay: !!event.allDay,
    color: event.color,
    attendees: parseAttendees(event.attendees),
    organizerEmail: event.organizerEmail ?? undefined,
    talkUrl: event.talkUrl ?? undefined,
    isRecurring: !!event.isRecurring,
    rrule: event.rrule ?? undefined,
    recurrenceId: event.recurrenceId != null ? new Date(event.recurrenceId) : undefined,
    alarmMinutes: event.alarmMinutes ?? undefined,
    isTask: !!event.isTask,
  };
}
