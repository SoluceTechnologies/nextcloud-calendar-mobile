import { matchesQuery, toSearchable } from '@/features/search/matchEvent';
import { parseQuery } from '@/features/search/parseQuery';
import type { CalendarEvent } from '@/types';

const now = new Date(2026, 10, 2, 10, 0).getTime();

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    uid: 'event-1',
    href: '/remote.php/dav/calendars/alice/perso/event-1.ics',
    calendarId: 'perso',
    accountId: 'account-1',
    summary: 'Dentist',
    description: 'Bring the card',
    location: 'Rue Haute',
    dtstart: new Date(2026, 10, 2, 15, 0),
    dtend: new Date(2026, 10, 2, 16, 0),
    allDay: false,
    color: '#0082c9',
    attendees: [{ email: 'bob@example.org', displayName: 'Bob Stone' }],
    isRecurring: false,
    ...overrides,
  };
}

const timed = (start: Date, end: Date) => makeEvent({ dtstart: start, dtend: end });
const allDay = (firstDay: Date, lastDay: Date) => makeEvent({ dtstart: firstDay, dtend: lastDay, allDay: true });

const matches = (event: CalendarEvent, input: string, calendarName = 'Perso') =>
  matchesQuery(toSearchable(event, calendarName), parseQuery(input), now);

describe('text', () => {
  it('free text matches title, location, description, calendar name or attendee', () => {
    const event = makeEvent();
    expect(matches(event, 'dentist')).toBe(true);
    expect(matches(event, 'haute')).toBe(true);
    expect(matches(event, 'card')).toBe(true);
    expect(matches(event, 'perso')).toBe(true);
    expect(matches(event, 'stone')).toBe(true);
    expect(matches(event, 'bob@example')).toBe(true);
    expect(matches(event, 'plumber')).toBe(false);
  });

  it('every free word must match', () => {
    expect(matches(makeEvent({ summary: 'Team lunch' }), 'team lunch')).toBe(true);
    expect(matches(makeEvent({ summary: 'Team sync' }), 'team lunch')).toBe(false);
  });

  it('folds accents and case', () => {
    expect(matches(makeEvent({ summary: 'Réunion' }), 'reunion')).toBe(true);
    expect(matches(makeEvent({ summary: 'reunion' }), 'RÉUNION')).toBe(true);
  });

  it('tolerates missing location and description', () => {
    const event = makeEvent({ location: undefined, description: undefined, attendees: [] });
    expect(matches(event, 'dentist')).toBe(true);
    expect(matches(event, 'paris')).toBe(false);
    expect(matches(event, 'location:paris')).toBe(false);
  });

  it('calendar and attendee tokens match their field only', () => {
    expect(matches(makeEvent(), 'calendar:work', 'Work')).toBe(true);
    expect(matches(makeEvent({ summary: 'Work review' }), 'calendar:work', 'Perso')).toBe(false);
    expect(matches(makeEvent(), 'attendee:bob@example.org')).toBe(true);
    expect(matches(makeEvent({ attendees: [], description: 'bob@example.org' }), 'attendee:bob@example.org')).toBe(false);
  });

  it('title, location and description tokens match their field only', () => {
    expect(matches(makeEvent(), 'title:dentist')).toBe(true);
    expect(matches(makeEvent(), 'title:haute')).toBe(false);
    expect(matches(makeEvent(), 'location:haute')).toBe(true);
    expect(matches(makeEvent(), 'description:card')).toBe(true);
  });
});

describe('date', () => {
  it('today matches an event overlapping today and an all-day event of today, not yesterday', () => {
    expect(matches(timed(new Date(2026, 10, 2, 15, 0), new Date(2026, 10, 2, 16, 0)), 'date:today')).toBe(true);
    expect(matches(allDay(new Date(2026, 10, 2), new Date(2026, 10, 2)), 'date:today')).toBe(true);
    expect(matches(timed(new Date(2026, 10, 1, 15, 0), new Date(2026, 10, 1, 16, 0)), 'date:today')).toBe(false);
    expect(matches(allDay(new Date(2026, 10, 1), new Date(2026, 10, 1)), 'date:today')).toBe(false);
  });

  it('tomorrow', () => {
    expect(matches(timed(new Date(2026, 10, 3, 9, 0), new Date(2026, 10, 3, 10, 0)), 'date:tomorrow')).toBe(true);
    expect(matches(timed(new Date(2026, 10, 2, 15, 0), new Date(2026, 10, 2, 16, 0)), 'date:tomorrow')).toBe(false);
  });

  it('week includes a start at now + 7 days, excludes one minute later', () => {
    expect(matches(timed(new Date(2026, 10, 9, 10, 0), new Date(2026, 10, 9, 11, 0)), 'date:week')).toBe(true);
    expect(matches(timed(new Date(2026, 10, 9, 10, 1), new Date(2026, 10, 9, 11, 0)), 'date:week')).toBe(false);
    expect(matches(timed(new Date(2026, 10, 2, 8, 0), new Date(2026, 10, 2, 9, 0)), 'date:week')).toBe(false);
  });

  it('month uses calendar months', () => {
    expect(matches(timed(new Date(2026, 11, 2, 10, 0), new Date(2026, 11, 2, 11, 0)), 'date:month')).toBe(true);
    expect(matches(timed(new Date(2026, 11, 2, 10, 1), new Date(2026, 11, 2, 11, 0)), 'date:month')).toBe(false);
  });

  it('upcoming keeps an in-progress event, past keeps an ended one', () => {
    const inProgress = timed(new Date(2026, 10, 2, 9, 0), new Date(2026, 10, 2, 11, 0));
    const ended = timed(new Date(2026, 10, 2, 8, 0), new Date(2026, 10, 2, 9, 0));
    const allDayToday = allDay(new Date(2026, 10, 2), new Date(2026, 10, 2));
    expect(matches(inProgress, 'date:upcoming')).toBe(true);
    expect(matches(inProgress, 'date:past')).toBe(false);
    expect(matches(ended, 'date:past')).toBe(true);
    expect(matches(ended, 'date:upcoming')).toBe(false);
    expect(matches(allDayToday, 'date:upcoming')).toBe(true);
  });

  it('comparators compare the start day', () => {
    const fourthLate = timed(new Date(2026, 10, 4, 23, 0), new Date(2026, 10, 5, 1, 0));
    const fifthEarly = timed(new Date(2026, 10, 5, 0, 30), new Date(2026, 10, 5, 1, 0));
    expect(matches(fourthLate, 'date:<2026-11-05')).toBe(true);
    expect(matches(fifthEarly, 'date:<2026-11-05')).toBe(false);
    expect(matches(fourthLate, 'date:>=2026-11-05')).toBe(false);
    expect(matches(fifthEarly, 'date:>=2026-11-05')).toBe(true);
    expect(matches(fifthEarly, 'date:>2026-11-04')).toBe(true);
    expect(matches(fourthLate, 'date:<=2026-11-04')).toBe(true);
  });

  it('plain date matches a multi-day event covering it', () => {
    const conference = allDay(new Date(2026, 10, 1), new Date(2026, 10, 3));
    expect(matches(conference, 'date:2026-11-02')).toBe(true);
    expect(matches(conference, 'date:2026-11-03')).toBe(true);
    expect(matches(conference, 'date:2026-11-04')).toBe(false);
  });

  it('unknown date value matches nothing', () => {
    expect(matches(makeEvent(), 'date:soon')).toBe(false);
  });
});
