import { occurrenceSlot, exceptionResourceUid } from '../../../src/features/event/occurrenceTarget';
import type { CalendarEvent } from '../../../src/types';

const occurrence = (over: Partial<CalendarEvent>): CalendarEvent => ({
  uid: 'series-1_occ_1785331800',
  href: '/cal/series.ics',
  calendarId: 'cal-1',
  accountId: 'acc-1',
  summary: 'Busy',
  dtstart: new Date('2026-08-05T15:00:00Z'),
  dtend: new Date('2026-08-05T15:45:00Z'),
  allDay: false,
  color: '#0082c9',
  attendees: [],
  isRecurring: true,
  ...over,
});

describe('occurrenceSlot', () => {
  it('returns the RECURRENCE-ID slot for an occurrence that was moved', () => {
    const moved = occurrence({ recurrenceId: new Date('2026-07-29T13:30:00Z') });
    expect(occurrenceSlot(moved).toISOString()).toBe('2026-07-29T13:30:00.000Z');
  });

  it('falls back to dtstart when the occurrence sits in its original slot', () => {
    const plain = occurrence({ recurrenceId: new Date('2026-08-05T15:00:00Z') });
    expect(occurrenceSlot(plain).toISOString()).toBe('2026-08-05T15:00:00.000Z');
  });

  it('falls back to dtstart for events that carry no slot at all', () => {
    expect(occurrenceSlot(occurrence({})).toISOString()).toBe('2026-08-05T15:00:00.000Z');
  });
});

describe('exceptionResourceUid', () => {
  it('keys the exception on the master UID and the slot, not on the moved start', () => {
    const moved = occurrence({ recurrenceId: new Date('2026-07-29T13:30:00Z') });
    expect(exceptionResourceUid(moved)).toBe(
      `series-1-exc-${new Date('2026-07-29T13:30:00Z').getTime()}`,
    );
  });

  it('stays stable when the same occurrence is edited again after being moved', () => {
    const first = occurrence({ recurrenceId: new Date('2026-07-29T13:30:00Z') });
    const editedAgain = occurrence({
      recurrenceId: new Date('2026-07-29T13:30:00Z'),
      dtstart: new Date('2026-08-06T09:00:00Z'),
      dtend: new Date('2026-08-06T09:30:00Z'),
    });
    expect(exceptionResourceUid(editedAgain)).toBe(exceptionResourceUid(first));
  });
});
