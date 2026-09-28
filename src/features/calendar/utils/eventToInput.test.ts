import { eventToInput } from '@/features/calendar/utils/eventToInput';
import type { Account, CalendarEvent } from '@/types';

const base: CalendarEvent = {
  uid: 'u1', href: '/u1.ics', calendarId: 'cal-1', accountId: 'a1',
  summary: 'Standup',
  description: 'Daily sync',
  location: 'Room 2',
  dtstart: new Date(2026, 7, 7, 9, 0),
  dtend: new Date(2026, 7, 7, 9, 30),
  allDay: false,
  color: '#0082c9',
  attendees: [{ email: 'a@example.org', displayName: 'A' }],
  organizerEmail: 'me@example.org',
  isRecurring: false,
  alarmMinutes: 10,
};

const account: Account = {
  id: 'acc-1',
  displayName: 'Charlie',
  baseUrl: 'https://cloud.example.org',
  username: 'charlie',
  appPassword: 'secret',
  davUserId: 'charlie',
  email: 'charlie@example.org',
};

describe('eventToInput', () => {
  it('carries every field the update path needs', () => {
    const input = eventToInput(base, account);
    expect(input.summary).toBe('Standup');
    expect(input.calendarId).toBe('cal-1');
    expect(input.dtstart).toEqual(base.dtstart);
    expect(input.dtend).toEqual(base.dtend);
    expect(input.allDay).toBe(false);
    expect(input.description).toBe('Daily sync');
    expect(input.location).toBe('Room 2');
    expect(input.attendees).toEqual(base.attendees);
    expect(input.alarmMinutes).toBe(10);
  });

  it('never asks for a new Talk room', () => {
    expect(eventToInput(base, account).withTalkRoom).toBe(false);
  });

  it('reads the stored recurrence rule back so a drag does not destroy the series', () => {
    const recurring: CalendarEvent = {
      ...base,
      isRecurring: true,
      rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
    };
    expect(eventToInput(recurring, account).rrule).toEqual({ freq: 'WEEKLY', byDay: ['MO'] });
  });

  it('leaves rrule undefined when the stored rule cannot be represented exactly', () => {
    const exotic: CalendarEvent = {
      ...base,
      isRecurring: true,
      rrule: 'RRULE:FREQ=MONTHLY;BYMONTHDAY=15',
    };
    expect(eventToInput(exotic, account).rrule).toBeUndefined();
  });

  it('tolerates an event with no optional fields', () => {
    const bare: CalendarEvent = {
      ...base,
      description: undefined,
      location: undefined,
      organizerEmail: undefined,
      alarmMinutes: undefined,
    };
    const input = eventToInput(bare, account);
    expect(input.description).toBeUndefined();
  });

  it('does not alias the attendee array', () => {
    const input = eventToInput(base, account);
    expect(input.attendees).not.toBe(base.attendees);
  });

  describe('organizer', () => {
    it('uses the account email when set', () => {
      const input = eventToInput(base, account);
      expect(input.organizerEmail).toBe('charlie@example.org');
      expect(input.organizerName).toBe('Charlie');
    });

    it('falls back to the username when it is already an email', () => {
      const noEmail: Account = { ...account, email: undefined, username: 'charlie@work.org' };
      expect(eventToInput(base, noEmail).organizerEmail).toBe('charlie@work.org');
    });

    it('falls back to username@host when neither email nor an email-shaped username is available', () => {
      const noEmail: Account = { ...account, email: undefined, username: 'charlie' };
      expect(eventToInput(base, noEmail).organizerEmail).toBe('charlie@cloud.example.org');
    });

    it("ignores the event's own stored organizer entirely", () => {
      const otherOrganizer: CalendarEvent = { ...base, organizerEmail: 'someone-else@example.org' };
      expect(eventToInput(otherOrganizer, account).organizerEmail).toBe('charlie@example.org');
    });
  });
});

describe('eventToInput recurrence end date', () => {
  it('reads a date-only UNTIL of an all-day series as a local day, not a UTC instant', () => {
    const input = eventToInput(
      { ...base, allDay: true, isRecurring: true, rrule: 'RRULE:FREQ=WEEKLY;UNTIL=20260815' },
      account
    );
    expect(input.rrule?.until).toEqual(new Date(2026, 7, 15));
  });

  it('leaves the UTC UNTIL of a timed series untouched', () => {
    const input = eventToInput(
      { ...base, isRecurring: true, rrule: 'RRULE:FREQ=WEEKLY;UNTIL=20260815T093000Z' },
      account
    );
    expect(input.rrule?.until?.toISOString()).toBe('2026-08-15T09:30:00.000Z');
  });

  it('keeps COUNT as-is', () => {
    const input = eventToInput(
      { ...base, allDay: true, isRecurring: true, rrule: 'RRULE:FREQ=WEEKLY;COUNT=4' },
      account
    );
    expect(input.rrule).toEqual({ freq: 'WEEKLY', count: 4 });
  });
});
