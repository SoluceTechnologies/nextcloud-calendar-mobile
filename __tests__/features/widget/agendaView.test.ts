import { agendaGroups, agendaHeader, agendaPalette, compactEvents, emptyLabel } from '@/features/widget/core/agendaView';
import { widgetPalette } from '@/features/widget/core/theme';
import type { AgendaDaySection, AgendaEventItem, AgendaSnapshot } from '@/features/widget/core/types';

function item(uid: string): AgendaEventItem {
  return {
    uid,
    title: uid,
    startIso: '2026-08-01T12:00:00Z',
    endIso: '2026-08-01T13:00:00Z',
    allDay: false,
    color: '#3b82f6',
    timeLabel: '12:00 – 13:00',
    deepLink: `x://${uid}`,
  };
}

function section(partial: Partial<AgendaDaySection> & { dayKey: string }): AgendaDaySection {
  return {
    dayLabel: 'MON',
    dayNumber: '1',
    weekdayLong: 'Monday',
    isToday: false,
    items: [],
    ...partial,
  };
}

function snapshot(partial: Partial<AgendaSnapshot>): AgendaSnapshot {
  return {
    generatedAtIso: '2026-08-01T09:00:00Z',
    timeZone: 'Europe/Berlin',
    scheme: 'light',
    dayLabel: 'SAT',
    dayNumber: '1',
    relativeLabel: 'Saturday 1 August',
    events: [],
    sections: [],
    ...partial,
  };
}

describe('compactEvents', () => {
  it('caps the flat list at the limit', () => {
    const snap = snapshot({ events: [item('a'), item('b'), item('c')] });
    expect(compactEvents(snap, 2).map((e) => e.uid)).toEqual(['a', 'b']);
  });

  it('returns an empty list for a null snapshot', () => {
    expect(compactEvents(null, 3)).toEqual([]);
  });
});

describe('emptyLabel / agendaHeader', () => {
  it('falls back to defaults for a null snapshot', () => {
    expect(emptyLabel(null)).toBe('No upcoming event');
    expect(agendaHeader(null)).toEqual({ dayLabel: '', dayNumber: '--' });
  });

  it('reads labels from the snapshot', () => {
    const snap = snapshot({ relativeLabel: 'Later', dayLabel: 'SUN', dayNumber: '2' });
    expect(emptyLabel(snap)).toBe('Later');
    expect(agendaHeader(snap)).toEqual({ dayLabel: 'SUN', dayNumber: '2' });
  });
});

describe('agendaPalette', () => {
  it('resolves the palette from the snapshot scheme', () => {
    expect(agendaPalette(snapshot({ scheme: 'dark' }))).toEqual(widgetPalette('dark'));
    expect(agendaPalette(null)).toEqual(widgetPalette('light'));
  });
});

describe('agendaGroups', () => {
  const snap = snapshot({
    sections: [
      section({ dayKey: 'd1', weekdayLong: 'Monday', dayNumber: '1', isToday: true, items: [item('a'), item('b')] }),
      section({ dayKey: 'd2', items: [] }),
      section({ dayKey: 'd3', weekdayLong: 'Wednesday', dayNumber: '3', items: [item('c'), item('d')] }),
    ],
  });

  it('drops empty sections and formats the header', () => {
    const groups = agendaGroups(snap);
    expect(groups.map((g) => g.key)).toEqual(['d1', 'd3']);
    expect(groups[0].header).toBe('Monday 1');
    expect(groups[0].isToday).toBe(true);
    expect(groups.flatMap((g) => g.items.map((i) => i.uid))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('caps the total item count at the budget across days', () => {
    const groups = agendaGroups(snap, 3);
    expect(groups.flatMap((g) => g.items.map((i) => i.uid))).toEqual(['a', 'b', 'c']);
  });

  it('returns no groups for a null snapshot', () => {
    expect(agendaGroups(null)).toEqual([]);
  });
});
