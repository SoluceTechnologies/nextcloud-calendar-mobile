import ICAL from 'ical.js';
import type { CalendarEvent, Attendee } from '@/types';

interface ParseCalMeta {
  calendarId: string;
  accountId: string;
  color: string;
}

const TALK_URL_PATTERN = /\/call\//;

export function parseIcsObjects(
  items: { ics: string; href: string }[],
  meta: ParseCalMeta
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const { ics, href } of items) {
    try {
      const jcal = ICAL.parse(ics);
      const comp = new ICAL.Component(jcal);
      const vevents = comp.getAllSubcomponents('vevent');

      for (const vevent of vevents) {
        const event = new ICAL.Event(vevent);
        const startDate = event.startDate;
        const endDate = event.endDate;
        const isAllDay = startDate.isDate;

        const attendeePropList = vevent.getAllProperties('attendee');
        const attendees: Attendee[] = attendeePropList.map((prop: any) => {
          const value: string = prop.getFirstValue() ?? '';
          const email = value.replace(/^mailto:/i, '');
          const displayName = prop.getParameter('cn') ?? undefined;
          return { email, displayName };
        });

        const location = event.location ?? undefined;
        const talkUrl = location && TALK_URL_PATTERN.test(location) ? location : undefined;

        const organizerProp = vevent.getFirstProperty('organizer');
        const organizerEmail = organizerProp
          ? (organizerProp.getFirstValue() as string).replace(/^mailto:/i, '')
          : undefined;

        const isRecurring = !!vevent.getFirstPropertyValue('rrule');

        events.push({
          uid: event.uid,
          href,
          calendarId: meta.calendarId,
          accountId: meta.accountId,
          summary: event.summary,
          description: event.description ?? undefined,
          location,
          dtstart: startDate.toJSDate(),
          dtend: endDate.toJSDate(),
          allDay: isAllDay,
          color: meta.color,
          attendees,
          organizerEmail,
          talkUrl,
          isRecurring,
        });
      }
    } catch {
      // Skip malformed
    }
  }

  return events;
}
