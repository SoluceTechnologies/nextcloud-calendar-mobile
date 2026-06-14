// __tests__/utils/caldav-parse.test.ts
import { parseIcsObjects, parseIcsObjectsAsync } from '../../src/utils/caldav-parse';

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
    // frameBudgetMs=0 forces a cooperative yield after each resource — exercises
    // the time-slicing path without changing the result.
    const events = await parseIcsObjectsAsync(items, calMeta, rangeStart, rangeEnd, 0);
    const sync = parseIcsObjects(items, calMeta, rangeStart, rangeEnd);
    expect(events).toEqual(sync);
    expect(events.length).toBeGreaterThan(0);
  });
});
