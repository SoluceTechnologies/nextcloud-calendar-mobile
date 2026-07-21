import ICAL from 'ical.js';
import type { CalendarEvent, Attendee } from '@/types';
import { yieldToUI } from '@/utils/scheduling';

interface ParseCalMeta {
  calendarId: string;
  accountId: string;
  color: string;
}

const TALK_URL_PATTERN = /\/call\//;

const MAX_OCCURRENCES = 1000;


function icalTimeToDate(t: ICAL.Time, isEnd = false): Date {
  if (t.isDate) {
    return isEnd
      ? new Date(t.year, t.month - 1, t.day - 1)
      : new Date(t.year, t.month - 1, t.day);
  }
  return t.toJSDate();
}


export function parseIcsItem(
  item: { ics: string; href: string },
  meta: ParseCalMeta,
  rangeStart?: Date,
  rangeEnd?: Date,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const { ics, href } = item;

  try {
    const jcal = ICAL.parse(ics);
    const comp = new ICAL.Component(jcal);
    const vevents = comp.getAllSubcomponents('vevent');

    for (const vevent of vevents) {
      if (vevent.getFirstPropertyValue('recurrence-id')) continue;

      const icalEvent = new ICAL.Event(vevent, { strictExceptions: false });

      const attendees: Attendee[] = vevent.getAllProperties('attendee').map((prop: ICAL.Property) => {
        const value = (prop.getFirstValue() as string) ?? '';
        const email = value.replace(/^mailto:/i, '');
        const displayName = (prop.getParameter('cn') as string) ?? undefined;
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
        const durationMs =
          icalEvent.endDate.toJSDate().getTime() - icalEvent.startDate.toJSDate().getTime();
        const rangeStartMs = rangeStart?.getTime() ?? -Infinity;
        const iter = icalEvent.iterator();
        let emitted = 0;
        let nextTime: ICAL.Time;

        while ((nextTime = iter.next()) && emitted < MAX_OCCURRENCES) {
          const occStart = icalTimeToDate(nextTime);

          if (rangeEnd && occStart >= rangeEnd) break;

          if (occStart.getTime() + durationMs <= rangeStartMs) continue;

          const details = icalEvent.getOccurrenceDetails(nextTime);
          const occAllDay = details.startDate.isDate;
          const occEnd = icalTimeToDate(details.endDate, true);

          if (rangeStart && occEnd <= rangeStart) continue;

          events.push({
            ...base,
            uid: `${icalEvent.uid}_occ_${nextTime.toUnixTime()}`,
            href,
            dtstart: occStart,
            dtend: occEnd,
            allDay: occAllDay,
          });
          emitted++;
        }
      } else {
        events.push({
          ...base,
          dtstart: icalTimeToDate(icalEvent.startDate),
          dtend: icalTimeToDate(icalEvent.endDate, true),
        });
      }
    }
  } catch {
  }

  return events;
}

export function parseIcsObjects(
  items: { ics: string; href: string }[],
  meta: ParseCalMeta,
  rangeStart?: Date,
  rangeEnd?: Date,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const item of items) {
    const parsed = parseIcsItem(item, meta, rangeStart, rangeEnd);
    if (parsed.length) events.push(...parsed);
  }
  return events;
}


export async function parseIcsObjectsAsync(
  items: { ics: string; href: string }[],
  meta: ParseCalMeta,
  rangeStart?: Date,
  rangeEnd?: Date,
  frameBudgetMs = 8,
): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  let sliceStart = Date.now();

  for (const item of items) {
    const parsed = parseIcsItem(item, meta, rangeStart, rangeEnd);
    if (parsed.length) events.push(...parsed);

    if (Date.now() - sliceStart >= frameBudgetMs) {
      await yieldToUI();
      sliceStart = Date.now();
    }
  }

  return events;
}
