import { buildIcs, buildAllDayIcs, shiftIcsDates, injectExdate, truncateRruleUntil } from '@/utils/ics';
import { parseRrule } from '@/features/calendar/utils/parseRrule';
import type { Attendee } from '../../src/types';

const base = {
  uid: 'test-uid-123',
  summary: 'Team Sync',
  description: 'Weekly sync',
  location: 'https://cloud.example.com/call/abc123',
  dtstart: new Date('2026-06-01T14:00:00Z'),
  dtend: new Date('2026-06-01T15:00:00Z'),
  organizerEmail: 'john@example.com',
  organizerName: 'John Doe',
  attendees: [] as Attendee[],
  timezone: 'UTC',
};

const allDayBase = {
  uid: 'allday-uid',
  summary: 'Holiday',
  description: '',
  location: '',
  dtstart: new Date(2026, 5, 15),
  dtend: new Date(2026, 5, 15),
  organizerEmail: 'john@example.com',
  organizerName: 'John Doe',
  attendees: [] as Attendee[],
};

describe('buildIcs', () => {
  it('produces valid VCALENDAR/VEVENT structure', () => {
    const ics = buildIcs(base);
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('BEGIN:VEVENT\r\n');
    expect(ics).toContain('END:VEVENT\r\n');
    expect(ics).toContain('END:VCALENDAR\r\n');
  });

  it('writes non-recurring timed events with TZID, like recurring ones', () => {
    const ics = buildIcs({ ...base, timezone: 'Europe/Paris' });
    expect(ics).toContain('DTSTART;TZID=Europe/Paris:20260601T160000\r\n');
    expect(ics).toContain('DTEND;TZID=Europe/Paris:20260601T170000\r\n');
  });

  it('recurring events keep their anchor zone via TZID', () => {
    const ics = buildIcs({ ...base, timezone: 'Europe/Paris', rrule: { freq: 'WEEKLY' } });
    expect(ics).toContain('DTSTART;TZID=Europe/Paris:20260601T160000\r\n');
    expect(ics).toContain('DTEND;TZID=Europe/Paris:20260601T170000\r\n');
    expect(ics).toContain('RRULE:FREQ=WEEKLY\r\n');
  });

  it('encodes UID correctly', () => {
    expect(buildIcs(base)).toContain('UID:test-uid-123\r\n');
  });

  it('includes ORGANIZER with mailto once somebody is invited', () => {
    const ics = buildIcs({ ...base, attendees: [{ email: 'alice@example.com' }] });
    expect(ics).toContain('ORGANIZER;CN=John Doe:mailto:john@example.com\r\n');
  });

  it('omits ORGANIZER on a solo event so calendar co-editors keep write access', () => {
    expect(buildIcs(base)).not.toContain('ORGANIZER');
    expect(buildAllDayIcs(base)).not.toContain('ORGANIZER');
  });

  it('defaults SEQUENCE to 0 and carries the given one', () => {
    expect(buildIcs(base)).toContain('SEQUENCE:0\r\n');
    expect(buildIcs({ ...base, sequence: 3 })).toContain('SEQUENCE:3\r\n');
    expect(buildAllDayIcs({ ...base, sequence: 2 })).toContain('SEQUENCE:2\r\n');
  });

  it('includes ATTENDEE lines with RSVP=TRUE', () => {
    const ics = buildIcs({
      ...base,
      attendees: [{ email: 'alice@example.com', displayName: 'Alice' }],
    });
    expect(ics).toContain('RSVP=TRUE');
    expect(ics).toContain('mailto:alice@example.com');
    expect(ics).toContain('CN=Alice');
  });

  it('escapes special chars in summary', () => {
    const ics = buildIcs({ ...base, summary: 'Sync, Team; All' });
    expect(ics).toContain('SUMMARY:Sync\\, Team\\; All\r\n');
  });

  it('folds lines longer than 75 bytes', () => {
    const longSummary = 'A'.repeat(100);
    const ics = buildIcs({ ...base, summary: longSummary });
    const lines = ics.split('\r\n');
    const summaryLine = lines.find((l) => l.startsWith('SUMMARY'));
    expect(summaryLine).toBeDefined();
    const summaryBytes = new TextEncoder().encode(summaryLine!).length;
    expect(summaryBytes).toBeLessThanOrEqual(75);
  });

  it('omits DESCRIPTION when empty', () => {
    const ics = buildIcs({ ...base, description: '' });
    expect(ics).not.toContain('DESCRIPTION');
  });

  it('omits LOCATION when empty', () => {
    const ics = buildIcs({ ...base, location: '' });
    expect(ics).not.toContain('LOCATION');
  });
});

describe('buildAllDayIcs', () => {
  it('uses DATE value type for DTSTART and exclusive DTEND (single day)', () => {
    const ics = buildAllDayIcs(allDayBase);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260615\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20260616\r\n');
  });

  it('writes exclusive DTEND one day after the inclusive end (multi-day)', () => {
    const ics = buildAllDayIcs({ ...allDayBase, dtend: new Date(2026, 5, 17) });
    expect(ics).toContain('DTSTART;VALUE=DATE:20260615\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20260618\r\n');
  });

  it('rolls the exclusive DTEND across a year boundary (Dec 31 -> Jan 1)', () => {
    const ics = buildAllDayIcs({
      ...allDayBase,
      dtstart: new Date(2026, 11, 31),
      dtend: new Date(2026, 11, 31),
    });
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20270101\r\n');
  });

  it('does not contain a TZID in DTSTART', () => {
    const ics = buildAllDayIcs(allDayBase);
    expect(ics).not.toContain('TZID');
  });

  it('writes UNTIL as a DATE so it matches the DATE-valued DTSTART', () => {
    const ics = buildAllDayIcs({
      ...allDayBase,
      rrule: { freq: 'WEEKLY', until: new Date(2026, 6, 20, 23, 59, 59) },
    });
    expect(ics).toContain('RRULE:FREQ=WEEKLY;UNTIL=20260720\r\n');
  });

  it('writes COUNT unchanged for all-day series', () => {
    const ics = buildAllDayIcs({ ...allDayBase, rrule: { freq: 'DAILY', count: 5 } });
    expect(ics).toContain('RRULE:FREQ=DAILY;COUNT=5\r\n');
  });
});

describe('recurrence end date round-trip', () => {
  function rruleOf(ics: string): string {
    return ics.split('\r\n').find((line) => line.startsWith('RRULE:'))!;
  }

  it('survives a write/read cycle unchanged for an all-day series', () => {
    const until = new Date(2026, 6, 20);
    const ics = buildAllDayIcs({ ...allDayBase, rrule: { freq: 'WEEKLY', until } });

    expect(parseRrule(rruleOf(ics))?.until).toEqual(until);
  });

  it('survives a write/read cycle unchanged for a timed series', () => {
    const until = new Date(2026, 6, 20, 23, 59, 59);
    const ics = buildIcs({ ...base, rrule: { freq: 'WEEKLY', until } });

    expect(parseRrule(rruleOf(ics))?.until).toEqual(until);
  });
});

describe('rruleLine end conditions', () => {
  it('writes COUNT for a bounded number of occurrences', () => {
    const ics = buildIcs({ ...base, rrule: { freq: 'WEEKLY', count: 10 } });
    expect(ics).toContain('RRULE:FREQ=WEEKLY;COUNT=10\r\n');
  });

  it('writes UNTIL as a UTC timestamp for timed events', () => {
    const ics = buildIcs({
      ...base,
      rrule: { freq: 'WEEKLY', until: new Date(Date.UTC(2026, 6, 20, 21, 59, 59)) },
    });
    expect(ics).toContain('RRULE:FREQ=WEEKLY;UNTIL=20260720T215959Z\r\n');
  });

  it('prefers COUNT over UNTIL when both are somehow set', () => {
    const ics = buildIcs({
      ...base,
      rrule: { freq: 'WEEKLY', count: 3, until: new Date(Date.UTC(2026, 6, 20)) },
    });
    expect(ics).toContain('RRULE:FREQ=WEEKLY;COUNT=3\r\n');
    expect(ics).not.toContain('UNTIL');
  });

  it('keeps BYDAY before the end condition', () => {
    const ics = buildIcs({ ...base, rrule: { freq: 'WEEKLY', byDay: ['MO', 'WE'], count: 4 } });
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4\r\n');
  });

  it('writes monthly positional BYDAY', () => {
    const ics = buildIcs({ ...base, rrule: { freq: 'MONTHLY', byDay: ['3SA'] } });
    expect(ics).toContain('RRULE:FREQ=MONTHLY;BYDAY=3SA\r\n');
  });

  it('writes yearly BYMONTH and positional BYDAY', () => {
    const ics = buildIcs({ ...base, rrule: { freq: 'YEARLY', byMonth: [7], byDay: ['3SA'] } });
    expect(ics).toContain('RRULE:FREQ=YEARLY;BYMONTH=7;BYDAY=3SA\r\n');
  });

  it('writes yearly BYWEEKNO and BYDAY', () => {
    const ics = buildIcs({ ...base, rrule: { freq: 'YEARLY', byWeekNo: [31], byDay: ['SU'] } });
    expect(ics).toContain('RRULE:FREQ=YEARLY;BYWEEKNO=31;BYDAY=SU\r\n');
  });
});

const VTIMEZONE_PARIS = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Paris',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
].join('\r\n');

describe('shiftIcsDates', () => {
  const serverIcs = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nextcloud//EN',
    'BEGIN:VEVENT',
    'UID:evt-1',
    'DTSTAMP:20260101T090000Z',
    'SEQUENCE:2',
    'DTSTART;TZID=Europe/Paris:20260810T120000',
    'DTEND;TZID=Europe/Paris:20260810T130000',
    'SUMMARY:Jkjkjkjkjkj',
    'DESCRIPTION:Talk: https://cloud.example.com/call/atapii4b',
    'LOCATION:https://cloud.example.com/call/atapii4b',
    'X-NEXTCLOUD-TALK:atapii4b',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  it('moves DTSTART/DTEND and bumps SEQUENCE while keeping every other property', () => {
    const out = shiftIcsDates(
      serverIcs,
      new Date('2026-08-10T07:45:00Z'),
      new Date('2026-08-10T08:45:00Z'),
      'Europe/Paris',
      false,
      3,
    );

    expect(out).toContain('DTSTART;TZID=Europe/Paris:20260810T094500');
    expect(out).toContain('DTEND;TZID=Europe/Paris:20260810T104500');
    expect(out).toContain('SEQUENCE:3');
    expect(out).not.toContain('SEQUENCE:2');
    // Untouched properties survive the move — this is the drag-loses-data fix.
    expect(out).toContain('SUMMARY:Jkjkjkjkjkj');
    expect(out).toContain('DESCRIPTION:Talk: https://cloud.example.com/call/atapii4b');
    expect(out).toContain('LOCATION:https://cloud.example.com/call/atapii4b');
    expect(out).toContain('X-NEXTCLOUD-TALK:atapii4b');
    // Each date property replaced exactly once.
    expect(out.match(/DTSTART/g)).toHaveLength(1);
    expect(out.match(/DTEND/g)).toHaveLength(1);
  });

  it('writes all-day dates with an exclusive end', () => {
    const allDayServer = serverIcs
      .replace('DTSTART;TZID=Europe/Paris:20260810T120000', 'DTSTART;VALUE=DATE:20260810')
      .replace('DTEND;TZID=Europe/Paris:20260810T130000', 'DTEND;VALUE=DATE:20260811');

    const out = shiftIcsDates(
      allDayServer,
      new Date(2026, 7, 12),
      new Date(2026, 7, 12),
      'Europe/Paris',
      true,
      3,
    );

    expect(out).toContain('DTSTART;VALUE=DATE:20260812');
    expect(out).toContain('DTEND;VALUE=DATE:20260813');
    expect(out).toContain('LOCATION:https://cloud.example.com/call/atapii4b');
  });

  it('shifts the VEVENT, not the VTIMEZONE transition rules', () => {
    const withTz = serverIcs.replace('BEGIN:VEVENT', `${VTIMEZONE_PARIS}\r\nBEGIN:VEVENT`);

    const out = shiftIcsDates(
      withTz,
      new Date('2026-08-10T07:45:00Z'),
      new Date('2026-08-10T08:45:00Z'),
      'Europe/Paris',
      false,
      3,
    );

    expect(out).toContain('DTSTART;TZID=Europe/Paris:20260810T094500');
    expect(out).toContain('DTEND;TZID=Europe/Paris:20260810T104500');
    expect(out).toContain('DTSTART:19700329T020000');
    expect(out).toContain('DTSTART:19701025T030000');
    expect(out).not.toContain('20260810T120000');
  });
});

describe('injectExdate', () => {
  const master = `BEGIN:VEVENT\r
UID:weekly-1\r
DTSTART;TZID=Europe/Paris:20260805T140000\r
DTEND;TZID=Europe/Paris:20260805T150000\r
RRULE:FREQ=WEEKLY;BYDAY=WE\r
SUMMARY:Weekly 14h\r
END:VEVENT`;

  const override = `BEGIN:VEVENT\r
UID:weekly-1\r
RECURRENCE-ID;TZID=Europe/Paris:20260902T140000\r
DTSTART;TZID=Europe/Paris:20260902T160000\r
DTEND;TZID=Europe/Paris:20260902T170000\r
SUMMARY:Moved\r
END:VEVENT`;

  const wrap = (...bodies: string[]) =>
    `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${bodies.join('\r\n')}\r\nEND:VCALENDAR`;

  const slot = new Date('2026-08-26T12:00:00Z');

  it('writes the EXDATE on the master even when an override comes first', () => {
    const out = injectExdate(wrap(override, master), slot, 'Europe/Paris');
    const blocks = out.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).not.toContain('EXDATE');
    expect(blocks[1]).toContain('EXDATE;TZID=Europe/Paris:20260826T140000');
  });

  it('writes a single EXDATE on the master when it comes first', () => {
    const out = injectExdate(wrap(master, override), slot, 'Europe/Paris');
    const blocks = out.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];

    expect(blocks[0]).toContain('EXDATE;TZID=Europe/Paris:20260826T140000');
    expect(blocks[1]).not.toContain('EXDATE');
    expect(out.match(/EXDATE/g)).toHaveLength(1);
  });
});

describe('truncateRruleUntil', () => {
  it('caps the VEVENT RRULE, not the VTIMEZONE transition rules', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      VTIMEZONE_PARIS,
      'BEGIN:VEVENT',
      'UID:weekly-1',
      'DTSTART;TZID=Europe/Paris:20260805T140000',
      'DTEND;TZID=Europe/Paris:20260805T150000',
      'RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=10',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const out = truncateRruleUntil(ics, new Date('2026-08-25T21:59:59Z'));

    expect(out).toContain('RRULE:FREQ=WEEKLY;BYDAY=WE;UNTIL=20260825T215959Z');
    expect(out).toContain('RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\r\n');
    expect(out).toContain('RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\r\n');
    expect(out.match(/UNTIL=/g)).toHaveLength(1);
  });
});
