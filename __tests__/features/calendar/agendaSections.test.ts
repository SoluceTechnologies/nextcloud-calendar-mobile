import { buildAgendaSections } from '@/features/calendar/utils/agendaSections';
import type { CalendarEvent } from '@/types';

function ev(uid: string, start: Date, end: Date, allDay = false): CalendarEvent {
  return {
    uid,
    href: `/cal/${uid}.ics`,
    calendarId: 'personal',
    accountId: 'a1',
    summary: uid,
    dtstart: start,
    dtend: end,
    allDay,
    color: '#000',
    attendees: [],
    isRecurring: false,
  };
}

describe('buildAgendaSections', () => {
  it('generates one section per day across the window, including days before today', () => {
    const sections = buildAgendaSections(
      [],
      new Date(2026, 8, 13),
      new Date(2026, 8, 15),
    );
    expect(sections.map((s) => s.key)).toEqual([
      '2026-09-13',
      '2026-09-14',
      '2026-09-15',
    ]);
    expect(sections.every((s) => s.data.length === 0)).toBe(true);
  });

  it('buckets an event into the section matching its start day', () => {
    const sections = buildAgendaSections(
      [ev('e1', new Date(2026, 8, 14, 10), new Date(2026, 8, 14, 11))],
      new Date(2026, 8, 13),
      new Date(2026, 8, 16),
    );
    expect(sections[1].data.map((e) => e.uid)).toEqual(['e1']);
    expect(sections[0].data).toHaveLength(0);
    expect(sections[2].data).toHaveLength(0);
  });

  it('expands a multi-day event over each covered day', () => {
    const sections = buildAgendaSections(
      [ev('multi', new Date(2026, 8, 14, 10), new Date(2026, 8, 16, 12))],
      new Date(2026, 8, 13),
      new Date(2026, 8, 17),
    );
    const withEvent = sections.filter((s) => s.data.length > 0).map((s) => s.key);
    expect(withEvent).toEqual(['2026-09-14', '2026-09-15', '2026-09-16']);
  });

  it('clamps a long-running event to the window start instead of iterating from its start', () => {
    const sections = buildAgendaSections(
      [ev('long', new Date(2020, 0, 1), new Date(2030, 0, 1))],
      new Date(2026, 8, 14),
      new Date(2026, 8, 16),
    );
    expect(sections.every((s) => s.data.length === 1)).toBe(true);
  });

  it('sorts all-day events first, then by start time', () => {
    const sections = buildAgendaSections(
      [
        ev('b', new Date(2026, 8, 14, 14), new Date(2026, 8, 14, 15)),
        ev('all-day', new Date(2026, 8, 14), new Date(2026, 8, 15), true),
        ev('a', new Date(2026, 8, 14, 9), new Date(2026, 8, 14, 10)),
      ],
      new Date(2026, 8, 14),
      new Date(2026, 8, 15),
    );
    expect(sections[0].data.map((e) => e.uid)).toEqual(['all-day', 'a', 'b']);
  });
});
