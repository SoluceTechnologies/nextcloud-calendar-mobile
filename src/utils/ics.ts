import type { Attendee, RecurrenceRule } from '@/types';

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

function localStamp(date: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${g('year')}${g('month')}${g('day')}T${g('hour')}${g('minute')}${g('second')}`;
}

function buildRruleLine(rule: RecurrenceRule): string {
  const parts: string[] = [`FREQ=${rule.freq}`];
  if (rule.interval && rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.byDay && rule.byDay.length > 0) parts.push(`BYDAY=${rule.byDay.join(',')}`);
  if (rule.count) {
    parts.push(`COUNT=${rule.count}`);
  } else if (rule.until) {
    parts.push(`UNTIL=${utcStamp(rule.until)}`);
  }
  return `RRULE:${parts.join(';')}`;
}

export interface BuildIcsParams {
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
}

export function buildIcs(params: BuildIcsParams): string {
  const { uid, summary, description, location, dtstart, dtend, organizerEmail, organizerName, attendees, timezone, rrule } = params;
  const dtstamp = utcStamp(new Date());

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nextcloud Calendar Mobile//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=${timezone}:${localStamp(dtstart, timezone)}`,
    `DTEND;TZID=${timezone}:${localStamp(dtend, timezone)}`,
    `SUMMARY:${esc(summary)}`,
    ...(description ? [`DESCRIPTION:${esc(description)}`] : []),
    ...(location ? [`LOCATION:${esc(location)}`] : []),
    ...(rrule ? [buildRruleLine(rrule)] : []),
    `ORGANIZER;CN=${organizerName}:mailto:${organizerEmail}`,
    ...attendees.map((att) => {
      const cn = att.displayName ? `;CN=${att.displayName}` : '';
      return `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;RSVP=TRUE;PARTSTAT=NEEDS-ACTION${cn}:mailto:${att.email}`;
    }),
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.map(foldLine).join('');
}

export interface BuildAllDayIcsParams {
  uid: string;
  summary: string;
  description: string;
  location: string;
  date: Date;
  organizerEmail: string;
  organizerName: string;
  attendees: Attendee[];
  rrule?: RecurrenceRule;
}

export function buildAllDayIcs(params: BuildAllDayIcsParams): string {
  const { uid, summary, description, location, date, organizerEmail, organizerName, attendees, rrule } = params;
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const nextDay = new Date(date);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const nextDateStr = nextDay.toISOString().slice(0, 10).replace(/-/g, '');
  const dtstamp = utcStamp(new Date());

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nextcloud Calendar Mobile//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${dateStr}`,
    `DTEND;VALUE=DATE:${nextDateStr}`,
    `SUMMARY:${esc(summary)}`,
    ...(description ? [`DESCRIPTION:${esc(description)}`] : []),
    ...(location ? [`LOCATION:${esc(location)}`] : []),
    ...(rrule ? [buildRruleLine(rrule)] : []),
    `ORGANIZER;CN=${organizerName}:mailto:${organizerEmail}`,
    ...attendees.map((att) => {
      const cn = att.displayName ? `;CN=${att.displayName}` : '';
      return `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;RSVP=TRUE;PARTSTAT=NEEDS-ACTION${cn}:mailto:${att.email}`;
    }),
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.map(foldLine).join('');
}

/**
 * Inject an EXDATE into a master ICS to exclude a specific occurrence.
 * Returns the modified ICS string.
 */
export function injectExdate(masterIcs: string, occurrenceDtstart: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(occurrenceDtstart);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const stamp = `${g('year')}${g('month')}${g('day')}T${g('hour')}${g('minute')}${g('second')}`;
  const exdateLine = `EXDATE;TZID=${timezone}:${stamp}`;

  // Insert before END:VEVENT
  return masterIcs.replace(/(END:VEVENT)/, `${exdateLine}\r\n$1`);
}

/**
 * Set or replace RRULE UNTIL in a master ICS (for "this and following" delete).
 * Removes the old UNTIL/COUNT clause and adds UNTIL=<newUntil>.
 */
export function truncateRruleUntil(masterIcs: string, newUntil: Date): string {
  // Remove existing UNTIL or COUNT from RRULE
  let result = masterIcs.replace(/(RRULE:[^\r\n]*);(UNTIL|COUNT)=[^\r\n;]*/g, '$1');
  // Now append UNTIL
  const untilStr = utcStamp(newUntil);
  result = result.replace(/(RRULE:[^\r\n]*)/, `$1;UNTIL=${untilStr}`);
  return result;
}

/**
 * Build an exception VEVENT (RECURRENCE-ID) for editing a single occurrence.
 */
export function buildExceptionIcs(params: BuildIcsParams & { recurrenceId: Date }): string {
  const { uid, summary, description, location, dtstart, dtend, organizerEmail, organizerName, attendees, timezone, recurrenceId } = params;
  const dtstamp = utcStamp(new Date());

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nextcloud Calendar Mobile//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `RECURRENCE-ID;TZID=${timezone}:${localStamp(recurrenceId, timezone)}`,
    `DTSTART;TZID=${timezone}:${localStamp(dtstart, timezone)}`,
    `DTEND;TZID=${timezone}:${localStamp(dtend, timezone)}`,
    `SUMMARY:${esc(summary)}`,
    ...(description ? [`DESCRIPTION:${esc(description)}`] : []),
    ...(location ? [`LOCATION:${esc(location)}`] : []),
    `ORGANIZER;CN=${organizerName}:mailto:${organizerEmail}`,
    ...attendees.map((att) => {
      const cn = att.displayName ? `;CN=${att.displayName}` : '';
      return `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;RSVP=TRUE;PARTSTAT=NEEDS-ACTION${cn}:mailto:${att.email}`;
    }),
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.map(foldLine).join('');
}
