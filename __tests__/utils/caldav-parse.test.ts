import { parseIcsObjects, parseIcsObjectsAsync, extractDtstartDtend } from '@/utils/caldav-parse';
import { buildAllDayIcs } from '@/utils/ics';

const sampleIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:event-abc-123
SUMMARY:Team Meeting
DTSTART:20260601T140000Z
DTEND:20260601T150000Z
DESCRIPTION:Weekly sync
LOCATION:https://cloud.example.com/call/tok1
ORGANIZER;CN=John Doe:mailto:john@example.com
ATTENDEE;CN=Alice;RSVP=TRUE:mailto:alice@example.com
END:VEVENT
END:VCALENDAR`;

const allDayIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:allday-123
SUMMARY:Holiday
DTSTART;VALUE=DATE:20260615
DTEND;VALUE=DATE:20260616
END:VEVENT
END:VCALENDAR`;

const multiDayAllDayIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:multiday-1
SUMMARY:Trip
DTSTART;VALUE=DATE:20260615
DTEND;VALUE=DATE:20260618
END:VEVENT
END:VCALENDAR`;

const recurringIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:recurring-123
SUMMARY:Daily Standup
DTSTART:20260601T090000Z
DTEND:20260601T091500Z
RRULE:FREQ=DAILY
END:VEVENT
END:VCALENDAR`;

describe('parseIcsObjects', () => {
  const calMeta = { calendarId: 'cal-1', accountId: 'acc-1', color: '#0082c9' };

  it('parses basic event fields', () => {
    const events = parseIcsObjects([{ ics: sampleIcs, href: '/cal/event.ics' }], calMeta);
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.isTask).toBeFalsy();
    expect(e.uid).toBe('event-abc-123');
    expect(e.summary).toBe('Team Meeting');
    expect(e.description).toBe('Weekly sync');
    expect(e.location).toBe('https://cloud.example.com/call/tok1');
    expect(e.allDay).toBe(false);
    expect(e.isRecurring).toBe(false);
  });

  it('parses dtstart and dtend as Date objects', () => {
    const [event] = parseIcsObjects([{ ics: sampleIcs, href: '/cal/event.ics' }], calMeta);
    expect(event.dtstart).toBeInstanceOf(Date);
    expect(event.dtstart.toISOString()).toBe('2026-06-01T14:00:00.000Z');
    expect(event.dtend.toISOString()).toBe('2026-06-01T15:00:00.000Z');
  });

  it('parses attendees', () => {
    const [event] = parseIcsObjects([{ ics: sampleIcs, href: '/cal/event.ics' }], calMeta);
    expect(event.attendees).toHaveLength(1);
    expect(event.attendees[0].email).toBe('alice@example.com');
    expect(event.attendees[0].displayName).toBe('Alice');
  });

  it('extracts Talk URL from location matching /call/ pattern', () => {
    const [event] = parseIcsObjects([{ ics: sampleIcs, href: '/cal/event.ics' }], calMeta);
    expect(event.talkUrl).toBe('https://cloud.example.com/call/tok1');
  });

  it('does not set talkUrl for non-Talk locations', () => {
    const ics = sampleIcs.replace('LOCATION:https://cloud.example.com/call/tok1', 'LOCATION:Conference Room A');
    const [event] = parseIcsObjects([{ ics, href: '/cal/event.ics' }], calMeta);
    expect(event.talkUrl).toBeUndefined();
  });

  it('marks all-day events correctly', () => {
    const [event] = parseIcsObjects([{ ics: allDayIcs, href: '/cal/allday.ics' }], calMeta);
    expect(event.allDay).toBe(true);
  });

  it('parses a multi-day all-day event with an inclusive end', () => {
    const [event] = parseIcsObjects([{ ics: multiDayAllDayIcs, href: '/cal/m.ics' }], calMeta);
    expect(event.allDay).toBe(true);
    expect(event.dtstart.getFullYear()).toBe(2026);
    expect(event.dtstart.getMonth()).toBe(5);
    expect(event.dtstart.getDate()).toBe(15);
    expect(event.dtend.getDate()).toBe(17);
  });

  it('round-trips buildAllDayIcs -> parse preserving inclusive start and end', () => {
    const ics = buildAllDayIcs({
      uid: 'rt-1', summary: 'Trip', description: '', location: '',
      dtstart: new Date(2026, 5, 15),
      dtend: new Date(2026, 5, 17),
      organizerEmail: 'j@e.com', organizerName: 'J', attendees: [],
    });
    const [event] = parseIcsObjects([{ ics, href: '/cal/rt.ics' }], calMeta);
    expect(event.dtstart.getDate()).toBe(15);
    expect(event.dtend.getDate()).toBe(17);
  });

  it('marks recurring events correctly', () => {
    const [event] = parseIcsObjects([{ ics: recurringIcs, href: '/cal/recurring.ics' }], calMeta);
    expect(event.isRecurring).toBe(true);
  });

  it('assigns calendarId, accountId, and color', () => {
    const [event] = parseIcsObjects([{ ics: sampleIcs, href: '/cal/event.ics' }], calMeta);
    expect(event.calendarId).toBe('cal-1');
    expect(event.accountId).toBe('acc-1');
    expect(event.color).toBe('#0082c9');
  });

  it('handles multiple ICS strings', () => {
    const events = parseIcsObjects([{ ics: sampleIcs, href: '/cal/s.ics' }, { ics: allDayIcs, href: '/cal/a.ics' }], calMeta);
    expect(events).toHaveLength(2);
  });

  it('recovers events from a feed with broken (unfolded) multi-line DESCRIPTION', () => {
    const brokenIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:broken-fold-1
SUMMARY:Soirée théâtre
DTSTART:20260601T180000Z
DTEND:20260601T200000Z
DESCRIPTION:<p>Programme du soir</p>
Que n'ai-je donc tant vécu que pour cette infamie !</p>
<a href="https://example.com/info">Détails</a>
LOCATION:Toulouse
END:VEVENT
END:VCALENDAR`;
    const events = parseIcsObjects([{ ics: brokenIcs, href: '/cal/broken.ics' }], calMeta);
    expect(events).toHaveLength(1);
    expect(events[0].uid).toBe('broken-fold-1');
    expect(events[0].summary).toBe('Soirée théâtre');
    expect(events[0].location).toBe('Toulouse');
  });
});

describe('recurring expansion — old series', () => {
  const calMeta = { calendarId: 'cal-1', accountId: 'acc-1', color: '#0082c9' };
  const oldDailyIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:old-daily
SUMMARY:Ancient Standup
DTSTART:20200101T090000Z
DTEND:20200101T091500Z
RRULE:FREQ=DAILY
END:VEVENT
END:VCALENDAR`;

  it('emits in-window occurrences for a series that started years earlier', () => {
    const rangeStart = new Date('2026-06-01T00:00:00Z');
    const rangeEnd = new Date('2026-07-01T00:00:00Z');
    const events = parseIcsObjects(
      [{ ics: oldDailyIcs, href: '/cal/old.ics' }],
      calMeta,
      rangeStart,
      rangeEnd,
    );
    expect(events.length).toBe(30);
    expect(events.every((e) => e.dtstart >= rangeStart && e.dtstart < rangeEnd)).toBe(true);
  });
});

describe('recurring expansion — moved occurrences (RECURRENCE-ID overrides)', () => {
  const calMeta = { calendarId: 'cal-1', accountId: 'acc-1', color: '#0082c9' };
  const rangeStart = new Date('2026-07-27T00:00:00Z');
  const rangeEnd = new Date('2026-08-24T00:00:00Z');

  const series = (exception: string[]) =>
    [
      'BEGIN:VCALENDAR', 'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:moved-1',
      'SUMMARY:Busy',
      'DTSTART:20260729T133000Z',
      'DTEND:20260729T140000Z',
      'RRULE:FREQ=WEEKLY;COUNT=4',
      'END:VEVENT',
      ...exception,
      'END:VCALENDAR',
    ].join('\r\n');

  const expand = (ics: string) =>
    parseIcsObjects([{ ics, href: '/cal/moved.ics' }], calMeta, rangeStart, rangeEnd);

  it('takes the start from the exception DTSTART, not from RECURRENCE-ID', () => {
    const events = expand(
      series([
        'BEGIN:VEVENT', 'UID:moved-1', 'SUMMARY:Busy',
        'RECURRENCE-ID:20260729T133000Z',
        'DTSTART:20260805T150000Z',
        'DTEND:20260805T154500Z',
        'END:VEVENT',
      ]),
    );

    const moved = events.find((e) => e.dtend.toISOString() === '2026-08-05T15:45:00.000Z')!;
    expect(moved).toBeDefined();
    expect(moved.dtstart.toISOString()).toBe('2026-08-05T15:00:00.000Z');
    expect(moved.dtend.getTime() - moved.dtstart.getTime()).toBe(45 * 60_000);
  });

  it('never yields an occurrence that ends before it starts', () => {
    const events = expand(
      series([
        'BEGIN:VEVENT', 'UID:moved-1', 'SUMMARY:Busy',
        'RECURRENCE-ID:20260805T133000Z',
        'DTSTART:20260805T120000Z',
        'DTEND:20260805T121500Z',
        'END:VEVENT',
      ]),
    );

    expect(events.every((e) => e.dtend.getTime() > e.dtstart.getTime())).toBe(true);
  });

  it('keeps the original slot as recurrenceId so edits target the right instance', () => {
    const events = expand(
      series([
        'BEGIN:VEVENT', 'UID:moved-1', 'SUMMARY:Busy',
        'RECURRENCE-ID:20260729T133000Z',
        'DTSTART:20260805T150000Z',
        'DTEND:20260805T154500Z',
        'END:VEVENT',
      ]),
    );

    const moved = events.find((e) => e.dtstart.toISOString() === '2026-08-05T15:00:00.000Z')!;
    expect(moved.recurrenceId?.toISOString()).toBe('2026-07-29T13:30:00.000Z');

    const untouched = events.find((e) => e.dtstart.toISOString() === '2026-08-12T13:30:00.000Z')!;
    expect(untouched.recurrenceId?.toISOString()).toBe('2026-08-12T13:30:00.000Z');
  });

  it('keeps expanding the rest of the series when one occurrence moves past the window', () => {
    const events = expand(
      series([
        'BEGIN:VEVENT', 'UID:moved-1', 'SUMMARY:Busy',
        'RECURRENCE-ID:20260729T133000Z',
        'DTSTART:20270729T133000Z',
        'DTEND:20270729T140000Z',
        'END:VEVENT',
      ]),
    );

    expect(events.map((e) => e.dtstart.toISOString())).toEqual([
      '2026-08-05T13:30:00.000Z',
      '2026-08-12T13:30:00.000Z',
      '2026-08-19T13:30:00.000Z',
    ]);
  });

  it('takes summary, location and attendees from the exception that carries them', () => {
    const events = expand(
      series([
        'BEGIN:VEVENT', 'UID:moved-1',
        'RECURRENCE-ID:20260805T133000Z',
        'SUMMARY:Rescheduled review',
        'LOCATION:https://cloud.example.com/call/tok9',
        'ATTENDEE;CN=Alice:mailto:alice@example.com',
        'DTSTART:20260805T150000Z',
        'DTEND:20260805T154500Z',
        'END:VEVENT',
      ]),
    );

    const moved = events.find((e) => e.dtstart.toISOString() === '2026-08-05T15:00:00.000Z')!;
    expect(moved.summary).toBe('Rescheduled review');
    expect(moved.location).toBe('https://cloud.example.com/call/tok9');
    expect(moved.talkUrl).toBe('https://cloud.example.com/call/tok9');
    expect(moved.attendees.map((a) => a.email)).toEqual(['alice@example.com']);

    const untouched = events.find((e) => e.dtstart.toISOString() === '2026-08-12T13:30:00.000Z')!;
    expect(untouched.summary).toBe('Busy');
    expect(untouched.location).toBeUndefined();
    expect(untouched.attendees).toEqual([]);
  });

  it('falls back to the master for fields the exception does not restate', () => {
    const events = expand(
      series([
        'BEGIN:VEVENT', 'UID:moved-1',
        'RECURRENCE-ID:20260805T133000Z',
        'DTSTART:20260805T150000Z',
        'DTEND:20260805T154500Z',
        'END:VEVENT',
      ]),
    );

    const moved = events.find((e) => e.dtstart.toISOString() === '2026-08-05T15:00:00.000Z')!;
    expect(moved.summary).toBe('Busy');
  });

  it('keeps an exception attached to its own series in a multi-UID feed', () => {
    const feed = [
      'BEGIN:VCALENDAR', 'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:series-a', 'SUMMARY:A',
      'DTSTART:20260729T133000Z', 'DTEND:20260729T140000Z',
      'RRULE:FREQ=WEEKLY;COUNT=2',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:series-b', 'SUMMARY:B',
      'DTSTART:20260729T133000Z', 'DTEND:20260729T140000Z',
      'RRULE:FREQ=WEEKLY;COUNT=2',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:series-a', 'SUMMARY:A moved',
      'RECURRENCE-ID:20260805T133000Z',
      'DTSTART:20260806T100000Z', 'DTEND:20260806T101500Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const events = parseIcsObjects([{ ics: feed, href: '/cal/feed.ics' }], calMeta, rangeStart, rangeEnd);
    const starts = (uid: string) =>
      events
        .filter((e) => e.uid.startsWith(uid))
        .map((e) => e.dtstart.toISOString())
        .sort();

    expect(starts('series-a')).toEqual(['2026-07-29T13:30:00.000Z', '2026-08-06T10:00:00.000Z']);
    expect(starts('series-b')).toEqual(['2026-07-29T13:30:00.000Z', '2026-08-05T13:30:00.000Z']);
  });

  it('filters on the moved time, so an occurrence pulled into the window is emitted', () => {
    const events = parseIcsObjects(
      [{
        ics: series([
          'BEGIN:VEVENT', 'UID:moved-1', 'SUMMARY:Busy',
          'RECURRENCE-ID:20260819T133000Z',
          'DTSTART:20260810T100000Z',
          'DTEND:20260810T103000Z',
          'END:VEVENT',
        ]),
        href: '/cal/moved.ics',
      }],
      calMeta,
      new Date('2026-08-10T00:00:00Z'),
      new Date('2026-08-11T00:00:00Z'),
    );

    expect(events.map((e) => e.dtstart.toISOString())).toEqual(['2026-08-10T10:00:00.000Z']);
  });
});

describe('parseIcsObjectsAsync', () => {
  const calMeta = { calendarId: 'cal-1', accountId: 'acc-1', color: '#0082c9' };
  const rangeStart = new Date('2026-06-01T00:00:00Z');
  const rangeEnd = new Date('2026-06-30T23:59:59Z');
  const items = [
    { ics: sampleIcs, href: '/cal/s.ics' },
    { ics: allDayIcs, href: '/cal/a.ics' },
    { ics: recurringIcs, href: '/cal/r.ics' },
  ];

  it('produces identical output to the synchronous parser', async () => {
    const sync = parseIcsObjects(items, calMeta, rangeStart, rangeEnd);
    const async = await parseIcsObjectsAsync(items, calMeta, rangeStart, rangeEnd);
    expect(async).toEqual(sync);
  });

  it('still resolves correctly when forced to yield on every item', async () => {
    const events = await parseIcsObjectsAsync(items, calMeta, rangeStart, rangeEnd, 0);
    const sync = parseIcsObjects(items, calMeta, rangeStart, rangeEnd);
    expect(events).toEqual(sync);
    expect(events.length).toBeGreaterThan(0);
  });

  it('still resolves correctly with small chunk size', async () => {
    const events = await parseIcsObjectsAsync(items, calMeta, rangeStart, rangeEnd, 16, 1);
    const sync = parseIcsObjects(items, calMeta, rangeStart, rangeEnd);
    expect(events).toEqual(sync);
    expect(events.length).toBeGreaterThan(0);
  });
});

function ics(lines: string[]): string {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:series-1',
    ...lines,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

describe('extractDtstartDtend', () => {
  it('reads a UTC date-time pair', () => {
    const b = extractDtstartDtend(ics(['DTSTART:20260803T070000Z', 'DTEND:20260803T080000Z']));
    expect(b?.dtstart.toISOString()).toBe('2026-08-03T07:00:00.000Z');
    expect(b?.dtend.toISOString()).toBe('2026-08-03T08:00:00.000Z');
  });

  it('resolves a TZID date-time to the right instant', () => {
    const b = extractDtstartDtend(
      ics(['DTSTART;TZID=Europe/Paris:20260803T090000', 'DTEND;TZID=Europe/Paris:20260803T100000'])
    );
    expect(b?.dtstart.toISOString()).toBe('2026-08-03T07:00:00.000Z');
  });

  it('reads a date-only pair', () => {
    const b = extractDtstartDtend(ics(['DTSTART;VALUE=DATE:20260803', 'DTEND;VALUE=DATE:20260804']));
    expect(b?.dtstart.getFullYear()).toBe(2026);
    expect(b?.dtstart.getMonth()).toBe(7);
    expect(b?.dtstart.getDate()).toBe(3);
  });

  it('ignores an exception VEVENT and reads the master', () => {
    const withException = [
      'BEGIN:VCALENDAR', 'VERSION:2.0',
      'BEGIN:VEVENT', 'UID:s', 'RECURRENCE-ID:20260810T070000Z',
      'DTSTART:20260810T090000Z', 'DTEND:20260810T100000Z', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:s',
      'DTSTART:20260803T070000Z', 'DTEND:20260803T080000Z', 'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(extractDtstartDtend(withException)?.dtstart.toISOString()).toBe('2026-08-03T07:00:00.000Z');
  });

  it('returns undefined for unparseable input rather than guessing', () => {
    expect(extractDtstartDtend('not an ics')).toBeUndefined();
    expect(extractDtstartDtend('')).toBeUndefined();
  });
});

describe('VALARM parsing — alarmMinutes', () => {
  const calMeta = { calendarId: 'cal-1', accountId: 'acc-1', color: '#0082c9' };

  const withAlarm = (trigger: string) => `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:alarm-1
SUMMARY:Reminder
DTSTART:20260115T100000Z
DTEND:20260115T110000Z
BEGIN:VALARM
ACTION:DISPLAY
${trigger}
END:VALARM
END:VEVENT
END:VCALENDAR`;

  const minutesFor = (trigger: string) =>
    parseIcsObjects([{ ics: withAlarm(trigger), href: '/cal/a.ics' }], calMeta)[0].alarmMinutes;

  it('parses a relative "before" trigger to positive minutes', () => {
    expect(minutesFor('TRIGGER:-PT15M')).toBe(15);
    expect(minutesFor('TRIGGER:-P1D')).toBe(1440);
  });

  it('parses a relative "after start" trigger to negative minutes', () => {
    expect(minutesFor('TRIGGER:PT9H')).toBe(-540);
  });

  it('parses an absolute DATE-TIME trigger relative to the event start', () => {
    expect(minutesFor('TRIGGER;VALUE=DATE-TIME:20260115T094500Z')).toBe(15);
    expect(minutesFor('TRIGGER;VALUE=DATE-TIME:20260115T120000Z')).toBe(-120);
  });

  it('reports no alarm when the event carries no VALARM', () => {
    const [event] = parseIcsObjects([{ ics: sampleIcs, href: '/cal/event.ics' }], calMeta);
    expect(event.alarmMinutes).toBeUndefined();
  });
});

describe('parseIcsObjects VTODO (Deck cards / tasks)', () => {
  const calMeta = { calendarId: 'deck-1', accountId: 'acc-1', color: '#ff0000' };

  const deckCardTimed = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Nextcloud deck//EN
BEGIN:VTODO
UID:deck-card-42
SUMMARY:Ship the release
DESCRIPTION:Board: Roadmap
DUE:20260815T090000Z
STATUS:NEEDS-ACTION
END:VTODO
END:VCALENDAR`;

  const deckCardAllDay = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Nextcloud deck//EN
BEGIN:VTODO
UID:deck-card-allday
SUMMARY:Review PRs
DUE;VALUE=DATE:20260815
END:VTODO
END:VCALENDAR`;

  const deckCardNoDate = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:deck-card-nodate
SUMMARY:Someday task
END:VTODO
END:VCALENDAR`;

  const deckCardSpan = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:deck-card-span
SUMMARY:Sprint
DTSTART:20260815T090000Z
DUE:20260815T173000Z
END:VTODO
END:VCALENDAR`;

  it('parses a DUE-only VTODO with a default 15-minute duration so it renders', () => {
    const events = parseIcsObjects([{ ics: deckCardTimed, href: '/deck/42.ics' }], calMeta);
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.uid).toBe('deck-card-42');
    expect(e.summary).toBe('Ship the release');
    expect(e.description).toBe('Board: Roadmap');
    expect(e.allDay).toBe(false);
    expect(e.dtstart.toISOString()).toBe('2026-08-15T09:00:00.000Z');
    // DUE only -> non-zero block ending 15 min later (not a zero-height event).
    expect(e.dtend.toISOString()).toBe('2026-08-15T09:15:00.000Z');
    expect(e.dtend.getTime()).toBeGreaterThan(e.dtstart.getTime());
    expect(e.color).toBe('#ff0000');
    expect(e.calendarId).toBe('deck-1');
    expect(e.isTask).toBe(true);
  });

  it('spans a timed VTODO that carries both DTSTART and DUE', () => {
    const events = parseIcsObjects([{ ics: deckCardSpan, href: '/deck/span.ics' }], calMeta);
    expect(events).toHaveLength(1);
    expect(events[0].allDay).toBe(false);
    expect(events[0].dtstart.toISOString()).toBe('2026-08-15T09:00:00.000Z');
    expect(events[0].dtend.toISOString()).toBe('2026-08-15T17:30:00.000Z');
  });

  it('spans an all-day VTODO that carries both DTSTART and DUE (date-valued)', () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:deck-allday-span
SUMMARY:Multi-day task
DTSTART;VALUE=DATE:20260815
DUE;VALUE=DATE:20260818
END:VTODO
END:VCALENDAR`;
    const events = parseIcsObjects([{ ics, href: '/deck/ads.ics' }], calMeta);
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.allDay).toBe(true);
    // Exclusive date-valued end -> last shown day is Aug 17, like an all-day VEVENT.
    expect(e.dtstart.getFullYear()).toBe(2026);
    expect(e.dtstart.getMonth()).toBe(7);
    expect(e.dtstart.getDate()).toBe(15);
    expect(e.dtend.getDate()).toBe(17);
    expect(e.dtend.getTime()).toBeGreaterThan(e.dtstart.getTime());
  });

  it('does not invert a same-day all-day VTODO with DTSTART === DUE', () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:deck-allday-same
SUMMARY:Same-day task
DTSTART;VALUE=DATE:20260815
DUE;VALUE=DATE:20260815
END:VTODO
END:VCALENDAR`;
    const events = parseIcsObjects([{ ics, href: '/deck/same.ics' }], calMeta);
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.allDay).toBe(true);
    // Clamped to a single all-day cell rather than ending a day early.
    expect(e.dtend.getTime()).toBe(e.dtstart.getTime());
  });

  it('parses an all-day VTODO (DATE-valued DUE)', () => {
    const events = parseIcsObjects([{ ics: deckCardAllDay, href: '/deck/ad.ics' }], calMeta);
    expect(events).toHaveLength(1);
    expect(events[0].allDay).toBe(true);
    expect(events[0].summary).toBe('Review PRs');
  });

  it('skips a VTODO without any date (cannot place on agenda)', () => {
    const events = parseIcsObjects([{ ics: deckCardNoDate, href: '/deck/nd.ics' }], calMeta);
    expect(events).toHaveLength(0);
  });
});

describe('a deleted occurrence stays deleted', () => {
  const calMeta2 = { calendarId: 'cal-1', accountId: 'acc-1', color: '#0082c9' };
  const rangeStart = new Date('2026-08-01T00:00:00Z');
  const rangeEnd = new Date('2026-10-01T00:00:00Z');

  const orphanedFork = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:weekly-1
DTSTAMP:20260801T090000Z
DTSTART;TZID=Europe/Paris:20260805T140000
DTEND;TZID=Europe/Paris:20260805T150000
RRULE:FREQ=WEEKLY;BYDAY=WE
EXDATE;TZID=Europe/Paris:20260826T140000
SUMMARY:Weekly 14h
END:VEVENT
BEGIN:VEVENT
UID:weekly-1
DTSTAMP:20260801T090000Z
RECURRENCE-ID;TZID=Europe/Paris:20260826T140000
DTSTART;TZID=Europe/Paris:20260826T160000
DTEND;TZID=Europe/Paris:20260826T170000
SUMMARY:Weekly 14h (moved)
END:VEVENT
END:VCALENDAR`;

  it('drops an EXDATE-ed instance that still carries a RECURRENCE-ID override', () => {
    const events = parseIcsObjects(
      [{ ics: orphanedFork, href: '/c/weekly-1.ics' }],
      calMeta2,
      rangeStart,
      rangeEnd,
    );
    expect(events.map((e) => e.summary)).not.toContain('Weekly 14h (moved)');
    expect(
      events.some((e) => e.recurrenceId?.toISOString() === '2026-08-26T12:00:00.000Z'),
    ).toBe(false);
  });

  it('keeps an override whose instance is not excluded', () => {
    const noExdate = orphanedFork.replace('EXDATE;TZID=Europe/Paris:20260826T140000\n', '');
    const events = parseIcsObjects(
      [{ ics: noExdate, href: '/c/weekly-1.ics' }],
      calMeta2,
      rangeStart,
      rangeEnd,
    );
    expect(events.map((e) => e.summary)).toContain('Weekly 14h (moved)');
  });

  it('honours an EXDATE written in UTC against a zoned series', () => {
    const utcExdate = orphanedFork
      .replace('EXDATE;TZID=Europe/Paris:20260826T140000', 'EXDATE:20260826T120000Z');
    const events = parseIcsObjects(
      [{ ics: utcExdate, href: '/c/weekly-1.ics' }],
      calMeta2,
      rangeStart,
      rangeEnd,
    );
    expect(events.map((e) => e.summary)).not.toContain('Weekly 14h (moved)');
  });
});

// ical.js falls back to floating wall-clock comparison when the resource carries no
// VTIMEZONE for the DTSTART TZID, so an EXDATE stated in any other zone excluded
// nothing and the occurrence the server had removed came back at every sync.
describe('EXDATE matching does not depend on VTIMEZONE being present', () => {
  const calMeta3 = { calendarId: 'cal-1', accountId: 'acc-1', color: '#0082c9' };
  const rangeStart = new Date('2026-08-01T00:00:00Z');
  const rangeEnd = new Date('2026-10-01T00:00:00Z');
  const deletedSlot = '2026-08-26T12:00:00.000Z';

  // Weekly Wed 14:00 Europe/Paris, no VTIMEZONE — the shape the app itself writes.
  const withExdate = (exdateLine: string) => `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:weekly-tz
DTSTAMP:20260801T090000Z
DTSTART;TZID=Europe/Paris:20260805T140000
DTEND;TZID=Europe/Paris:20260805T150000
RRULE:FREQ=WEEKLY;BYDAY=WE
${exdateLine}
SUMMARY:Weekly 14h
END:VEVENT
END:VCALENDAR`;

  const occurrences = (exdateLine: string) =>
    parseIcsObjects(
      [{ ics: withExdate(exdateLine), href: '/c/weekly-tz.ics' }],
      calMeta3,
      rangeStart,
      rangeEnd,
    ).map((e) => e.dtstart.toISOString());

  it.each([
    ['same zone as DTSTART', 'EXDATE;TZID=Europe/Paris:20260826T140000'],
    ['UTC with Z suffix', 'EXDATE:20260826T120000Z'],
    ['TZID=UTC', 'EXDATE;TZID=UTC:20260826T120000'],
    ['a third zone', 'EXDATE;TZID=America/New_York:20260826T080000'],
  ])('excludes the instance when EXDATE is written in %s', (_label, exdateLine) => {
    const got = occurrences(exdateLine);
    expect(got).not.toContain(deletedSlot);
    expect(got).toContain('2026-08-19T12:00:00.000Z');
    expect(got).toContain('2026-09-02T12:00:00.000Z');
  });

  it('keeps every occurrence when there is no EXDATE at all', () => {
    const got = occurrences('X-NOTHING:1');
    expect(got).toContain(deletedSlot);
  });
});
