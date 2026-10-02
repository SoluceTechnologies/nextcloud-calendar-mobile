import { toGridEvents } from '@/features/calendar/utils/toGridEvents';
import type { CalendarEvent } from '@/types';

const base: CalendarEvent = {
  uid: 'e1', href: '/e1.ics', calendarId: 'c1', accountId: 'a1',
  summary: 'Standup',
  dtstart: new Date(2026, 7, 7, 9, 0), dtend: new Date(2026, 7, 7, 9, 30),
  allDay: false, color: '#0082c9', attendees: [], isRecurring: false,
};

describe('toGridEvents', () => {
  it('drops literal duplicates but keeps same uid in another calendar or at another start', () => {
    const out = toGridEvents([
      base,
      { ...base },
      { ...base, calendarId: 'c2' },
      { ...base, dtstart: new Date(2026, 7, 8, 9, 0) },
    ]);
    expect(out).toHaveLength(3);
  });
});
