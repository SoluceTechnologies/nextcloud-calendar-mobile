import { writeEvent } from '../../src/database/sync';
import { mapEventToShared } from '../../src/database/mappers/event';
import type { CalendarEvent } from '../../src/types';

const occurrence: CalendarEvent = {
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
  recurrenceId: new Date('2026-07-29T13:30:00Z'),
};

describe('recurrenceId persistence', () => {
  it('survives a write/read round trip so a moved occurrence stays identifiable', () => {
    const row = {} as Parameters<typeof writeEvent>[0];
    writeEvent(row, occurrence);

    const restored = mapEventToShared(row as unknown as Parameters<typeof mapEventToShared>[0]);

    expect(restored.recurrenceId?.toISOString()).toBe('2026-07-29T13:30:00.000Z');
    expect(restored.dtstart.toISOString()).toBe('2026-08-05T15:00:00.000Z');
  });

  it('leaves recurrenceId undefined for a plain non-recurring event', () => {
    const row = {} as Parameters<typeof writeEvent>[0];
    writeEvent(row, { ...occurrence, isRecurring: false, recurrenceId: undefined });

    const restored = mapEventToShared(row as unknown as Parameters<typeof mapEventToShared>[0]);

    expect(restored.recurrenceId).toBeUndefined();
  });
});
