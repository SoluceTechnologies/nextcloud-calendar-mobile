import type { Attendee, CalendarEvent } from '@/types';

function sameAttendees(a: Attendee[], b: Attendee[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((att, i) => att.email === b[i].email);
}

export function sameDisplayedEvent(a: CalendarEvent, b: CalendarEvent): boolean {
  return (
    a.uid === b.uid &&
    a.summary === b.summary &&
    a.dtstart.getTime() === b.dtstart.getTime() &&
    a.dtend.getTime() === b.dtend.getTime() &&
    a.allDay === b.allDay &&
    a.calendarId === b.calendarId &&
    a.color === b.color &&
    a.href === b.href &&
    (a.location ?? '') === (b.location ?? '') &&
    (a.description ?? '') === (b.description ?? '') &&
    (a.talkUrl ?? '') === (b.talkUrl ?? '') &&
    a.isRecurring === b.isRecurring &&
    a.timezone === b.timezone &&
    sameAttendees(a.attendees, b.attendees)
  );
}
