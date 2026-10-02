import { sameDisplayedEvent } from '@/features/event/utils/sameDisplayedEvent';
import type { CalendarEvent } from '../../src/types';

const base: CalendarEvent = {
  uid: 'uid-abc',
  href: 'https://cloud.example.com/remote.php/dav/calendars/john/personal/uid-abc.ics',
  calendarId: 'cal-personal',
  accountId: 'acc-1',
  summary: 'Standup',
  description: 'Daily sync',
  location: 'Room 1',
  dtstart: new Date('2026-06-15T09:00:00Z'),
  dtend: new Date('2026-06-15T09:30:00Z'),
  allDay: false,
  color: '#0082c9',
  attendees: [{ email: 'a@example.com' }],
  isRecurring: false,
};

function clone(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    ...base,
    dtstart: new Date(base.dtstart),
    dtend: new Date(base.dtend),
    attendees: base.attendees.map((a) => ({ ...a })),
    ...overrides,
  };
}

describe('sameDisplayedEvent', () => {
  it('is true for two distinct objects with identical displayed fields', () => {
    expect(sameDisplayedEvent(base, clone({}))).toBe(true);
  });

  it('is false when the calendar changed (move) even though summary and times are equal', () => {
    const moved = clone({
      calendarId: 'cal-work',
      color: '#ff0000',
      href: 'https://cloud.example.com/remote.php/dav/calendars/john/work/uid-abc.ics',
    });
    expect(sameDisplayedEvent(base, moved)).toBe(false);
  });

  it('is false when summary changed', () => {
    expect(sameDisplayedEvent(base, clone({ summary: 'Sync' }))).toBe(false);
  });

  it('is false when start time changed', () => {
    expect(sameDisplayedEvent(base, clone({ dtstart: new Date('2026-06-15T10:00:00Z') }))).toBe(false);
  });

  it('is false when location changed', () => {
    expect(sameDisplayedEvent(base, clone({ location: 'Room 2' }))).toBe(false);
  });

  it('is false when an attendee was added', () => {
    expect(sameDisplayedEvent(base, clone({ attendees: [{ email: 'a@example.com' }, { email: 'b@example.com' }] }))).toBe(false);
  });
});
