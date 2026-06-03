import type { Attendee } from '@/types';

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
}

export function buildIcs(params: BuildIcsParams): string {
  const { uid, summary, description, location, dtstart, dtend, organizerEmail, organizerName, attendees, timezone } = params;
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
}

export function buildAllDayIcs(params: BuildAllDayIcsParams): string {
  const { uid, summary, description, location, date, organizerEmail, organizerName, attendees } = params;
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
