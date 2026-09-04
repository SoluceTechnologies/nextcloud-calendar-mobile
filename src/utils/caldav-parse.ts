import ICAL from 'ical.js';
import type { CalendarEvent, Attendee } from '@/types';
import { yieldToUI } from '@/utils/scheduling';
import { isValidTimeZone, zonedWallTimeToUtc } from '@/utils/timezone';
import { triggerToMinutes } from '@/features/notifications/alerts';

interface ParseCalMeta {
  calendarId: string;
  accountId: string;
  color: string;
}

const TALK_URL_PATTERN = /\/call\//;

const MAX_OCCURRENCES = 1000;

const DEFAULT_TODO_DURATION_MS = 15 * 60 * 1000;

function firstAlarmMinutes(vevent: ICAL.Component): number | undefined {
  const alarm = vevent.getFirstSubcomponent('valarm');
  const trigger = alarm?.getFirstProperty('trigger');
  if (!trigger) return undefined;

  const value = trigger.getFirstValue();

  if (value instanceof ICAL.Duration) {
    return -Math.round(value.toSeconds() / 60);
  }

  if (value instanceof ICAL.Time) {
    const start = vevent.getFirstPropertyValue('dtstart');
    if (start instanceof ICAL.Time) {
      return Math.round((start.toJSDate().getTime() - value.toJSDate().getTime()) / 60_000);
    }
  }

  const minutes = triggerToMinutes(trigger.toICALString().replace(/^TRIGGER[^:]*:/i, ''));
  return minutes ?? undefined;
}

function readAttendees(props: ICAL.Property[]): Attendee[] {
  const seen = new Set<string>();
  const attendees: Attendee[] = [];
  for (const prop of props) {
    const value = (prop.getFirstValue() as string) ?? '';
    const email = value.replace(/^mailto:/i, '');
    const displayName = (prop.getParameter('cn') as string) ?? undefined;
    const key = email.toLowerCase();
    if (email && seen.has(key)) continue;
    if (email) seen.add(key);
    attendees.push({ email, displayName });
  }
  return attendees;
}

function organizerEmailOf(vevent: ICAL.Component): string | undefined {
  const prop = vevent.getFirstProperty('organizer');
  return prop ? (prop.getFirstValue() as string).replace(/^mailto:/i, '') : undefined;
}

type OverridableFields = Pick<
  CalendarEvent,
  'summary' | 'description' | 'location' | 'talkUrl' | 'attendees' | 'organizerEmail' | 'alarmMinutes'
>;

function exceptionFields(vevent: ICAL.Component): Partial<OverridableFields> {
  const fields: Partial<OverridableFields> = {};

  const summary = vevent.getFirstPropertyValue('summary');
  if (typeof summary === 'string') fields.summary = summary;

  const description = vevent.getFirstPropertyValue('description');
  if (typeof description === 'string') fields.description = description;

  const location = vevent.getFirstPropertyValue('location');
  if (typeof location === 'string') {
    fields.location = location;
    fields.talkUrl = TALK_URL_PATTERN.test(location) ? location : undefined;
  }

  const attendeeProps = vevent.getAllProperties('attendee');
  if (attendeeProps.length) fields.attendees = readAttendees(attendeeProps);

  if (vevent.getFirstProperty('organizer')) fields.organizerEmail = organizerEmailOf(vevent);

  const alarmMinutes = firstAlarmMinutes(vevent);
  if (alarmMinutes !== undefined) fields.alarmMinutes = alarmMinutes;

  return fields;
}

function eventTzid(vevent: ICAL.Component): string | undefined {
  const raw = vevent.getFirstProperty('dtstart')?.getParameter('tzid');
  if (typeof raw !== 'string' || !raw) return undefined;
  if (isValidTimeZone(raw)) return raw;
  console.warn(`[caldav-parse] unresolvable TZID "${raw}", falling back to ical.js`);
  return undefined;
}

function occurrenceTzid(item: ICAL.Event | undefined, fallback: string | undefined): string | undefined {
  const comp = item?.component;
  if (!comp || !comp.getFirstProperty('dtstart')?.getParameter('tzid')) return fallback;
  return eventTzid(comp);
}

function isOverridden(slot: ICAL.Time, overrideIds: Set<string>): boolean {
  if (overrideIds.has(slot.toString())) return true;
  return overrideIds.has(slot.convertToZone(ICAL.Timezone.utcTimezone).toString());
}

function resolveInstant(t: ICAL.Time, tzid: string | undefined, isEnd = false): Date {
  if (t.isDate) {
    return isEnd
      ? new Date(t.year, t.month - 1, t.day - 1)
      : new Date(t.year, t.month - 1, t.day);
  }
  if (tzid) {
    return zonedWallTimeToUtc(t.year, t.month, t.day, t.hour, t.minute, t.second, tzid);
  }
  return t.toJSDate();
}

function excludedInstants(vevent: ICAL.Component, fallbackTzid: string | undefined): Set<number> {
  const excluded = new Set<number>();
  for (const prop of vevent.getAllProperties('exdate')) {
    const raw = prop.getParameter('tzid');
    const propTzid = typeof raw === 'string' && isValidTimeZone(raw) ? raw : undefined;
    for (const value of prop.getValues()) {
      if (!(value instanceof ICAL.Time)) continue;
      const zone = value.zone === ICAL.Timezone.utcTimezone ? undefined : propTzid ?? fallbackTzid;
      excluded.add(resolveInstant(value, zone).getTime());
    }
  }
  return excluded;
}

function repairIcsFolding(ics: string): string {
  const isPropertyStart = (line: string) =>
    /^(BEGIN|END):/i.test(line) || /^[A-Za-z][A-Za-z0-9-]*[;:]/.test(line);

  const out: string[] = [];
  for (const line of ics.split(/\r\n|\r|\n/)) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else if (out.length && !isPropertyStart(line)) {
      out[out.length - 1] += line;
    } else {
      out.push(line);
    }
  }
  return out.join('\r\n');
}

function parseIcsToJcal(ics: string): ReturnType<typeof ICAL.parse> {
  try {
    return ICAL.parse(ics);
  } catch {
    return ICAL.parse(repairIcsFolding(ics));
  }
}

function propTime(prop: ICAL.Property | null | undefined):
  { time: ICAL.Time; tzid?: string } | undefined {
  const value = prop?.getFirstValue();
  if (!(value instanceof ICAL.Time)) return undefined;
  const rawTz = prop?.getParameter('tzid');
  const tzid = typeof rawTz === 'string' && rawTz && isValidTimeZone(rawTz) ? rawTz : undefined;
  return { time: value, tzid };
}

function parseVtodo(
  vtodo: ICAL.Component,
  meta: ParseCalMeta,
  href: string,
): CalendarEvent | undefined {
  const uid = vtodo.getFirstPropertyValue('uid') as string | null;
  if (!uid) return undefined;

  const start = propTime(vtodo.getFirstProperty('dtstart'));
  const due = propTime(vtodo.getFirstProperty('due'));
  const anchor = start ?? due;
  if (!anchor) return undefined;

  const allDay = anchor.time.isDate;
  const dtstart = resolveInstant(anchor.time, anchor.tzid);

  let dtend: Date;
  if (start && due) {
    dtend = resolveInstant(due.time, due.tzid, allDay);
  } else if (allDay) {
    dtend = dtstart;
  } else {
    dtend = new Date(dtstart.getTime() + DEFAULT_TODO_DURATION_MS);
  }
  if (dtend.getTime() < dtstart.getTime()) {
    dtend = dtstart;
  }
  if (!allDay && dtend.getTime() <= dtstart.getTime()) {
    dtend = new Date(dtstart.getTime() + DEFAULT_TODO_DURATION_MS);
  }

  return {
    uid,
    href,
    calendarId: meta.calendarId,
    accountId: meta.accountId,
    summary: (vtodo.getFirstPropertyValue('summary') as string) ?? '',
    description: (vtodo.getFirstPropertyValue('description') as string) ?? undefined,
    location: (vtodo.getFirstPropertyValue('location') as string) ?? undefined,
    dtstart,
    dtend,
    allDay,
    color: meta.color,
    attendees: [],
    isRecurring: false,
    alarmMinutes: firstAlarmMinutes(vtodo),
    isTask: true,
  };
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
    const jcal = parseIcsToJcal(ics);
    const comp = new ICAL.Component(jcal);
    const vevents = comp.getAllSubcomponents('vevent');
    const vtodos = comp.getAllSubcomponents('vtodo');

    for (const vtodo of vtodos) {
      const todo = parseVtodo(vtodo, meta, href);
      if (todo) events.push(todo);
    }

    for (const vevent of vevents) {
      if (vevent.getFirstPropertyValue('recurrence-id')) continue;

      // A subscription feed is one .ics holding many UIDs. Left to itself ical.js
      // relates every RECURRENCE-ID sibling in the file to this master, so an
      // override would hijack any other series that happens to share its slot.
      const uid = vevent.getFirstPropertyValue('uid');
      const exceptions = vevents.filter(
        (v) => v.getFirstPropertyValue('recurrence-id') && v.getFirstPropertyValue('uid') === uid,
      );
      const icalEvent = new ICAL.Event(vevent, { strictExceptions: false, exceptions });
      const tzid = eventTzid(vevent);

      const attendees = readAttendees(vevent.getAllProperties('attendee'));

      const location = icalEvent.location ?? undefined;
      const talkUrl = location && TALK_URL_PATTERN.test(location) ? location : undefined;

      const organizerEmail = organizerEmailOf(vevent);

      const alarmMinutes = firstAlarmMinutes(vevent);

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
        alarmMinutes,
      };

      if (isRecurring && (rangeStart || rangeEnd)) {
        const durationMs =
          icalEvent.endDate.toJSDate().getTime() - icalEvent.startDate.toJSDate().getTime();
        const rangeStartMs = rangeStart?.getTime() ?? -Infinity;
        const rangeEndMs = rangeEnd?.getTime() ?? Infinity;

        const overrides: ICAL.Event[] = Object.values(icalEvent.exceptions ?? {});
        const overrideIds = new Set(overrides.map((ex) => ex.recurrenceId.toString()));
        const excluded = excludedInstants(vevent, tzid);
        const canPrefilter = icalEvent.rangeExceptions.length === 0;

        const inRange = (start: Date, end: Date) =>
          start.getTime() < rangeEndMs && end.getTime() > rangeStartMs;

        const pushOccurrence = (slot: ICAL.Time, item: ICAL.Event | undefined, startDate: ICAL.Time, endDate: ICAL.Time) => {
          const occTzid = occurrenceTzid(item, tzid);
          const occStart = resolveInstant(startDate, occTzid);
          const occEnd = resolveInstant(endDate, occTzid, true);

          if (!inRange(occStart, occEnd)) return false;

          events.push({
            ...base,
            ...(item && item.component !== vevent ? exceptionFields(item.component) : {}),
            uid: `${icalEvent.uid}_occ_${slot.toUnixTime()}`,
            href,
            recurrenceId: resolveInstant(slot, tzid),
            dtstart: occStart,
            dtend: occEnd,
            allDay: startDate.isDate,
          });
          return true;
        };

        const iter = icalEvent.iterator();
        let emitted = 0;
        let nextTime: ICAL.Time;

        while ((nextTime = iter.next()) && emitted < MAX_OCCURRENCES) {
          const slotStart = resolveInstant(nextTime, tzid);

          if (slotStart.getTime() >= rangeEndMs) break;

          if (excluded.has(slotStart.getTime())) continue;

          if (isOverridden(nextTime, overrideIds)) continue;

          if (canPrefilter && slotStart.getTime() + durationMs <= rangeStartMs) continue;

          const details = icalEvent.getOccurrenceDetails(nextTime);
          if (pushOccurrence(nextTime, details.item, details.startDate, details.endDate)) emitted++;
        }

        for (const ex of overrides) {
          if (emitted >= MAX_OCCURRENCES) break;
          if (excluded.has(resolveInstant(ex.recurrenceId, tzid).getTime())) continue;
          if (pushOccurrence(ex.recurrenceId, ex, ex.startDate, ex.endDate)) emitted++;
        }
      } else {
        events.push({
          ...base,
          dtstart: resolveInstant(icalEvent.startDate, tzid),
          dtend: resolveInstant(icalEvent.endDate, tzid, true),
        });
      }
    }
  } catch (error) {
    console.warn(`[caldav-parse] failed to parse ICS (${href}):`, error);
  }

  return events;
}

export function extractDtstartTzid(ics: string): string | undefined {
  const m = ics.match(/^DTSTART[^:\r\n]*;TZID=([^:;\r\n]+)/m);
  const tzid = m?.[1];
  return tzid && isValidTimeZone(tzid) ? tzid : undefined;
}

export function extractDtstartDtend(ics: string): { dtstart: Date; dtend: Date } | undefined {
  try {
    const comp = new ICAL.Component(parseIcsToJcal(ics));
    const master = comp
      .getAllSubcomponents('vevent')
      .find((v: ICAL.Component) => !v.getFirstPropertyValue('recurrence-id'));
    if (!master) return undefined;
    const icalEvent = new ICAL.Event(master, { strictExceptions: false });
    const tzid = eventTzid(master);
    return {
      dtstart: resolveInstant(icalEvent.startDate, tzid),
      dtend: resolveInstant(icalEvent.endDate, tzid, true),
    };
  } catch {
    return undefined;
  }
}

export function extractSequence(ics: string): number {
  const m = ics.match(/^SEQUENCE:(\d+)/m);
  const n = m ? Number(m[1]) : 0;
  return Number.isFinite(n) ? n : 0;
}

const WRITER_MANAGED_PROPS = new Set([
  'uid', 'dtstamp', 'sequence', 'dtstart', 'dtend', 'summary', 'description',
  'location', 'rrule', 'organizer', 'attendee', 'recurrence-id', 'last-modified', 'prodid',
]);

export function extractExtraVeventLines(ics: string): string[] {
  try {
    const comp = new ICAL.Component(parseIcsToJcal(ics));
    const vevents = comp.getAllSubcomponents('vevent');
    if (vevents.length === 0) return [];
    const master =
      vevents.find((v: ICAL.Component) => !v.getFirstPropertyValue('recurrence-id')) ?? vevents[0];
    return master
      .getAllProperties()
      .filter((p: ICAL.Property) => !WRITER_MANAGED_PROPS.has(p.name))
      .map((p: ICAL.Property) => p.toICALString());
  } catch {
    return [];
  }
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
  frameBudgetMs = 16,
  chunkSize = 10,
): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  let sliceStart = Date.now();

  for (let i = 0; i < items.length; i += chunkSize) {
    const batch = items.slice(i, i + chunkSize);
    for (const item of batch) {
      const parsed = parseIcsItem(item, meta, rangeStart, rangeEnd);
      if (parsed.length) events.push(...parsed);
    }

    if (i + chunkSize < items.length || Date.now() - sliceStart >= frameBudgetMs) {
      await yieldToUI();
      sliceStart = Date.now();
    }
  }

  return events;
}
