import type { Attendee, RecurrenceRule } from '@/types';
import { minutesToTrigger } from '@/features/notifications/alerts';

const PRODID = '-//Nextcloud Calendar Mobile//EN';

function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line + '\r\n';
  let offset = 0;
  let result = '';
  while (offset < bytes.length) {
    const chunk = bytes.slice(offset, offset + 75);
    result += new TextDecoder().decode(chunk);
    offset += 75;
    if (offset < bytes.length) result += '\r\n ';
  }
  return result + '\r\n';
}

function esc(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function dateStamp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

const TZ_STAMP_FMT = new Map<string, Intl.DateTimeFormat>();

function localStamp(date: Date, timezone: string): string {
  let fmt = TZ_STAMP_FMT.get(timezone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
    TZ_STAMP_FMT.set(timezone, fmt);
  }
  const parts = fmt.formatToParts(date);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${g('year')}${g('month')}${g('day')}T${g('hour')}${g('minute')}${g('second')}`;
}

function rruleLine(rule: RecurrenceRule, allDay = false): string {
  const parts: string[] = [`FREQ=${rule.freq}`];
  if (rule.interval && rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.byMonth && rule.byMonth.length > 0) parts.push(`BYMONTH=${rule.byMonth.join(',')}`);
  if (rule.byWeekNo && rule.byWeekNo.length > 0) parts.push(`BYWEEKNO=${rule.byWeekNo.join(',')}`);
  if (rule.byDay && rule.byDay.length > 0) parts.push(`BYDAY=${rule.byDay.join(',')}`);
  if (rule.count) parts.push(`COUNT=${rule.count}`);
  else if (rule.until) parts.push(`UNTIL=${allDay ? dateStamp(rule.until) : utcStamp(rule.until)}`);
  return `RRULE:${parts.join(';')}`;
}

function textLines(summary: string, description: string, location: string): string[] {
  return [
    `SUMMARY:${esc(summary)}`,
    ...(description ? [`DESCRIPTION:${esc(description)}`] : []),
    ...(location ? [`LOCATION:${esc(location)}`] : []),
  ];
}

function alarmLines(alarmMinutes?: number): string[] {
  if (alarmMinutes === undefined) return [];
  return [
    'BEGIN:VALARM',
    `TRIGGER:${minutesToTrigger(alarmMinutes)}`,
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'END:VALARM',
  ];
}

function schedulingLines(name: string, email: string, attendees: Attendee[]): string[] {
  if (attendees.length === 0) return [];
  return [`ORGANIZER;CN=${name}:mailto:${email}`, ...attendeeLines(attendees)];
}

function attendeeLines(attendees: Attendee[]): string[] {
  return attendees.map((att) => {
    const cn = att.displayName ? `;CN=${att.displayName}` : '';
    return `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;RSVP=TRUE;PARTSTAT=NEEDS-ACTION${cn}:mailto:${att.email}`;
  });
}

function serialize(veventBody: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'BEGIN:VEVENT',
    ...veventBody,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .map(foldLine)
    .join('');
}

type ExtraLines = { extraLines?: string[] };

export interface BuildIcsParams extends ExtraLines {
  uid: string;
  summary: string;
  description: string;
  location: string;
  dtstart: Date;
  dtend: Date;
  organizerEmail: string;
  organizerName: string;
  attendees: Attendee[];
  timezone: string;
  rrule?: RecurrenceRule;
  alarmMinutes?: number;
  sequence?: number;
}

export function buildIcs(params: BuildIcsParams): string {
  const { uid, summary, description, location, dtstart, dtend, organizerEmail, organizerName, attendees, timezone, rrule, alarmMinutes, sequence = 0, extraLines = [] } = params;

  return serialize([
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `SEQUENCE:${sequence}`,
    `DTSTART;TZID=${timezone}:${localStamp(dtstart, timezone)}`,
    `DTEND;TZID=${timezone}:${localStamp(dtend, timezone)}`,
    ...textLines(summary, description, location),
    ...(rrule ? [rruleLine(rrule)] : []),
    ...schedulingLines(organizerName, organizerEmail, attendees),
    ...extraLines,
    ...alarmLines(alarmMinutes),
  ]);
}

export type BuildAllDayIcsParams = Omit<BuildIcsParams, 'timezone'>;

export function buildAllDayIcs(params: BuildAllDayIcsParams): string {
  const { uid, summary, description, location, dtstart, dtend, organizerEmail, organizerName, attendees, rrule, alarmMinutes, sequence = 0, extraLines = [] } = params;
  const endExclusive = new Date(dtend.getFullYear(), dtend.getMonth(), dtend.getDate() + 1);

  return serialize([
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `SEQUENCE:${sequence}`,
    `DTSTART;VALUE=DATE:${dateStamp(dtstart)}`,
    `DTEND;VALUE=DATE:${dateStamp(endExclusive)}`,
    ...textLines(summary, description, location),
    ...(rrule ? [rruleLine(rrule, true)] : []),
    ...schedulingLines(organizerName, organizerEmail, attendees),
    ...extraLines,
    ...alarmLines(alarmMinutes),
  ]);
}

export function buildExceptionIcs(params: BuildIcsParams & { recurrenceId: Date }): string {
  const { uid, summary, description, location, dtstart, dtend, organizerEmail, organizerName, attendees, timezone, recurrenceId, alarmMinutes, sequence = 0, extraLines = [] } = params;

  return serialize([
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `SEQUENCE:${sequence}`,
    `RECURRENCE-ID;TZID=${timezone}:${localStamp(recurrenceId, timezone)}`,
    `DTSTART;TZID=${timezone}:${localStamp(dtstart, timezone)}`,
    `DTEND;TZID=${timezone}:${localStamp(dtend, timezone)}`,
    ...textLines(summary, description, location),
    ...schedulingLines(organizerName, organizerEmail, attendees),
    ...extraLines,
    ...alarmLines(alarmMinutes),
  ]);
}

export function shiftIcsDates(
  masterIcs: string,
  newStart: Date,
  newEnd: Date,
  timezone: string,
  allDay: boolean,
  sequence: number,
): string {
  const startLine = allDay
    ? `DTSTART;VALUE=DATE:${dateStamp(newStart)}`
    : `DTSTART;TZID=${timezone}:${localStamp(newStart, timezone)}`;
  const endExclusive = new Date(newEnd.getFullYear(), newEnd.getMonth(), newEnd.getDate() + 1);
  const endLine = allDay
    ? `DTEND;VALUE=DATE:${dateStamp(endExclusive)}`
    : `DTEND;TZID=${timezone}:${localStamp(newEnd, timezone)}`;

  let out = masterIcs
    .replace(/^DTSTART[^\r\n]*/m, startLine)
    .replace(/^DTEND[^\r\n]*/m, endLine);

  out = /^SEQUENCE:/m.test(out)
    ? out.replace(/^SEQUENCE:[^\r\n]*/m, `SEQUENCE:${sequence}`)
    : out.replace(/^(UID:[^\r\n]*\r?\n)/m, `$1SEQUENCE:${sequence}\r\n`);

  return out;
}

export function injectExdate(masterIcs: string, occurrenceDtstart: Date, timezone: string): string {
  const exdateLine = `EXDATE;TZID=${timezone}:${localStamp(occurrenceDtstart, timezone)}`;
  let injected = false;
  return masterIcs.replace(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g, (block) => {
    if (injected || /^RECURRENCE-ID[;:]/m.test(block)) return block;
    injected = true;
    return block.replace('END:VEVENT', `${exdateLine}\r\nEND:VEVENT`);
  });
}

export function truncateRruleUntil(masterIcs: string, newUntil: Date): string {
  return masterIcs
    .replace(/(RRULE:[^\r\n]*);(UNTIL|COUNT)=[^\r\n;]*/g, '$1')
    .replace(/(RRULE:[^\r\n]*)/, `$1;UNTIL=${utcStamp(newUntil)}`);
}
