import type { Account, CalendarEvent, CreateEventInput } from '@/types';
import { resolveOrganizer } from '@/features/event/utils/organizer';
import { parseRrule } from './parseRrule';

export function eventToInput(event: CalendarEvent, account: Account): CreateEventInput {
  const { organizerEmail, organizerName } = resolveOrganizer(account);
  return {
    summary: event.summary,
    calendarId: event.calendarId,
    dtstart: event.dtstart,
    dtend: event.dtend,
    allDay: event.allDay,
    description: event.description,
    location: event.location,
    attendees: [...event.attendees],
    withTalkRoom: false,
    organizerEmail,
    organizerName,
    rrule: parseRrule(event.rrule),
    alarms: event.alarms,
  };
}
