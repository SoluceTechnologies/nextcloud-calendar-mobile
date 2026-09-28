export interface EventSpec {
  uid: string;
  summary: string;
  location?: string;
}

export function ymd(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

export function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function allDay(e: EventSpec & { day: Date }): string {
  return calendar(e, [`DTSTART;VALUE=DATE:${ymd(e.day)}`, `DTEND;VALUE=DATE:${ymd(nextDay(e.day))}`]);
}

export function timed(e: EventSpec & { start: Date; end: Date }): string {
  return calendar(e, [`DTSTART:${utcStamp(e.start)}`, `DTEND:${utcStamp(e.end)}`]);
}

export function weekly(e: EventSpec & { day: Date; count: number }): string {
  return calendar(e, [
    `DTSTART;VALUE=DATE:${ymd(e.day)}`,
    `DTEND;VALUE=DATE:${ymd(nextDay(e.day))}`,
    `RRULE:FREQ=WEEKLY;COUNT=${e.count}`,
  ]);
}

export function veventsOf(ics: string): string[] {
  return unfold(ics).match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
}

export function prop(vevent: string, name: string): string | undefined {
  const line = unfold(vevent).split('\r\n').find((l) => l.startsWith(`${name}:`) || l.startsWith(`${name};`));
  return line?.slice(line.indexOf(':') + 1);
}

function calendar(e: EventSpec, dates: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NCM//E2E//EN',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${utcStamp(new Date())}`,
    ...dates,
    `SUMMARY:${e.summary}`,
    ...(e.location ? [`LOCATION:${e.location}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

function unfold(ics: string): string {
  return ics.replace(/\r?\n/g, '\r\n').replace(/\r\n[ \t]/g, '');
}

function nextDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
