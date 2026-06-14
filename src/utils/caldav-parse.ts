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

/**
 * Parse a single ICS resource into zero or more CalendarEvents.
 * Recurring events are expanded across [rangeStart, rangeEnd). Malformed ICS
 * is skipped (returns []). This is the atomic, synchronous unit of work shared
 * by the sync and chunked-async parsers below.
 */
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
        const expandComp = new ICAL.Component(jcal);
        const expandEvent = new ICAL.Event(expandComp.getFirstSubcomponent('vevent')!, {
          strictExceptions: false,
        });
        const iter = expandEvent.iterator();
        let count = 0;
        let nextTime: ICAL.Time;

        while ((nextTime = iter.next()) && count < MAX_OCCURRENCES) {
          const occStart = icalTimeToDate(nextTime);

          if (rangeEnd && occStart >= rangeEnd) break;

          const details = expandEvent.getOccurrenceDetails(nextTime);
          const occAllDay = details.startDate.isDate;
          const occEnd = icalTimeToDate(details.endDate, true);

          // Before the start of the requested range — skip but keep iterating
          if (rangeStart && occEnd <= rangeStart) {
            count++;
            continue;
          }

          events.push({
            ...base,
            uid: `${icalEvent.uid}_occ_${nextTime.toUnixTime()}`,
            href,
            dtstart: occStart,
            dtend: occEnd,
            allDay: occAllDay,
          });
          count++;
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
    // Skip malformed ICS
  }

  return events;
}

/** Synchronous parse of many ICS resources. Kept for tests and any caller
 *  that is not on the UI's critical path. */
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

/**
 * Chunked, cooperative parse of many ICS resources.
 *
 * Identical output to `parseIcsObjects`, but time-sliced: after each
 * `frameBudgetMs` of synchronous work it `await`s `yieldToUI()` so the JS
 * thread can service touches, gesture callbacks and renders before resuming.
 * This is what the event queries use, so a large background fetch never freezes
 * scrolling/swiping/zooming.
 */
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
