import { agendaRowKey, buildAgendaSections } from '@/features/calendar/utils/agendaSections';
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

  it('dedupes identical event rows on the same day (duplicate key guard)', () => {
    const e = ev('dup', new Date(2026, 8, 14, 10), new Date(2026, 8, 14, 11));
    const sections = buildAgendaSections(
      [e, { ...e }],
      new Date(2026, 8, 14),
      new Date(2026, 8, 15),
    );
    expect(sections[0].data).toHaveLength(1);
  });

  it('keeps same-uid events from different calendars as distinct rows', () => {
    const a = ev('shared', new Date(2026, 8, 14, 10), new Date(2026, 8, 14, 11));
    const b = { ...a, calendarId: 'shared-cal', href: '/cal/shared/shared.ics' };
    const sections = buildAgendaSections(
      [a, b],
      new Date(2026, 8, 14),
      new Date(2026, 8, 15),
    );
    expect(sections[0].data).toHaveLength(2);
    expect(agendaRowKey('2026-09-14', a)).not.toBe(agendaRowKey('2026-09-14', b));
  });

  it('gives recurring occurrences and same-day rows unique keys', () => {
    const occ1 = { ...ev('r', new Date(2026, 8, 14, 9), new Date(2026, 8, 14, 10)), uid: 'r_occ_1000' };
    const occ2 = { ...ev('r', new Date(2026, 8, 14, 17), new Date(2026, 8, 14, 18)), uid: 'r_occ_1000' };
    expect(agendaRowKey('2026-09-14', occ1)).not.toBe(agendaRowKey('2026-09-14', occ2));
  });
});
