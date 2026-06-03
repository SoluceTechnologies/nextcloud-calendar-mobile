import ICAL from 'ical.js';
import type { CalendarEvent, Attendee } from '@/types';

interface ParseCalMeta {
  calendarId: string;
  accountId: string;
  color: string;
}

const TALK_URL_PATTERN = /\/call\//;

// Safety cap so a badly-formed infinite recurrence can't loop forever
const MAX_OCCURRENCES = 1000;

export function parseIcsObjects(
  items: { ics: string; href: string }[],
  meta: ParseCalMeta,
  rangeStart?: Date,
  rangeEnd?: Date,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const { ics, href } of items) {
    try {
      const jcal = ICAL.parse(ics);
      const comp = new ICAL.Component(jcal);
      const vevents = comp.getAllSubcomponents('vevent');

      for (const vevent of vevents) {
        // Exception VEVENTs (RECURRENCE-ID present) are handled automatically
        // by the master's iterator — processing them separately would emit a
        // duplicate occurrence for every modified instance.
        if (vevent.getFirstPropertyValue('recurrence-id')) continue;

        const icalEvent = new ICAL.Event(vevent);

        const attendeePropList = vevent.getAllProperties('attendee');
        const attendees: Attendee[] = attendeePropList.map((prop: any) => {
          const value: string = prop.getFirstValue() ?? '';
          const email = value.replace(/^mailto:/i, '');
          const displayName = prop.getParameter('cn') ?? undefined;
          return { email, displayName };
        });

        const location = icalEvent.location ?? undefined;
        const talkUrl = location && TALK_URL_PATTERN.test(location) ? location : undefined;

        const organizerProp = vevent.getFirstProperty('organizer');
        const organizerEmail = organizerProp
          ? (organizerProp.getFirstValue() as string).replace(/^mailto:/i, '')
          : undefined;

        const rruleProp = vevent.getFirstProperty('rrule');
        const isRecurring = !!rruleProp;
        const rruleStr: string | undefined = rruleProp
          ? rruleProp.toICALString()
          : undefined;

        const base = {
          uid: icalEvent.uid,
          href,
          calendarId: meta.calendarId,
          accountId: meta.accountId,
          summary: icalEvent.summary,
          description: icalEvent.description ?? undefined,
          location,
          allDay: icalEvent.startDate.isDate,
          color: meta.color,
          attendees,
          organizerEmail,
          talkUrl,
          isRecurring,
          rrule: rruleStr,
        };

        if (isRecurring && (rangeStart || rangeEnd)) {
          // Expand all occurrences that fall within the requested range.
          // ical.js iterator walks RRULE + RDATEs while honouring EXDATEs and
          // RECURRENCE-ID overrides automatically when constructed from the full
          // component (not just the sub-component).
          const expandComp = new ICAL.Component(jcal);
          const expandEvent = new ICAL.Event(expandComp.getFirstSubcomponent('vevent')!, {
            strictExceptions: false,
          });
          const iter = expandEvent.iterator();
          let count = 0;
          let nextTime: ICAL.Time;

          while ((nextTime = iter.next()) && count < MAX_OCCURRENCES) {
            const occStart = nextTime.toJSDate();

            // Past the end of the requested range — stop iterating
            if (rangeEnd && occStart >= rangeEnd) break;

            const details = expandEvent.getOccurrenceDetails(nextTime);
            const occEnd = details.endDate.toJSDate();

            // Before the start of the requested range — skip but keep iterating
            if (rangeStart && occEnd <= rangeStart) {
              count++;
              continue;
            }

            events.push({
              ...base,
              // Each occurrence gets a stable unique id using a URL-safe separator.
              // href stays on the master so edit/delete can fetch the right ICS.
              uid: `${icalEvent.uid}_occ_${nextTime.toUnixTime()}`,
              href,
              dtstart: occStart,
              dtend: occEnd,
              allDay: details.startDate.isDate,
            });
            count++;
          }
        } else {
          // Non-recurring, or we have no range to constrain expansion
          events.push({
            ...base,
            dtstart: icalEvent.startDate.toJSDate(),
            dtend: icalEvent.endDate.toJSDate(),
          });
        }
      }
    } catch {
      // Skip malformed ICS
    }
  }

  return events;
}
