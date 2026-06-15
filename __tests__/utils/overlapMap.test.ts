import { computeOverlapMap } from '../../src/utils/overlapMap';
import type { CalendarEvent } from '../../src/types';

function ev(uid: string, startISO: string, endISO: string, allDay = false): CalendarEvent {
  return {
    uid, href: 'h', calendarId: 'c', accountId: 'a', summary: uid,
    allDay, color: '#fff', attendees: [], isRecurring: false,
    dtstart: new Date(startISO), dtend: new Date(endISO),
  } as CalendarEvent;
}

describe('computeOverlapMap', () => {
  it('non-overlapping timed events each span full width', () => {
    const m = computeOverlapMap([
      ev('a', '2026-01-01T09:00:00Z', '2026-01-01T10:00:00Z'),
      ev('b', '2026-01-01T11:00:00Z', '2026-01-01T12:00:00Z'),
    ]);
    expect(m.get('a')!.leftPct).toBe(0);
    expect(m.get('b')!.leftPct).toBe(0);
    expect(m.get('a')!.zIndex).toBe(100);
  });

  it('two overlapping events split into two columns', () => {
    const m = computeOverlapMap([
      ev('a', '2026-01-01T09:00:00Z', '2026-01-01T10:30:00Z'),
      ev('b', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z'),
    ]);
    expect(m.get('a')!.leftPct).toBe(0);
    expect(m.get('b')!.leftPct).toBe(50);
    expect(m.get('a')!.rightPx).toBe(0);
    expect(m.get('b')!.rightPx).toBe(3);
    expect(m.get('b')!.zIndex).toBe(101);
  });

  it('chained overlaps a-b, b-c (a,c disjoint) share one 2-column cluster', () => {
    const m = computeOverlapMap([
      ev('a', '2026-01-01T09:00:00Z', '2026-01-01T10:00:00Z'),
      ev('b', '2026-01-01T09:30:00Z', '2026-01-01T11:00:00Z'),
      ev('c', '2026-01-01T10:30:00Z', '2026-01-01T11:30:00Z'),
    ]);
    expect(m.get('a')!.leftPct).toBe(0);
    expect(m.get('b')!.leftPct).toBe(50);
    expect(m.get('c')!.leftPct).toBe(0);
  });

  it('events on different days never share a cluster', () => {
    const m = computeOverlapMap([
      ev('a', '2026-01-01T09:00:00Z', '2026-01-01T10:00:00Z'),
      ev('b', '2026-01-02T09:00:00Z', '2026-01-02T10:00:00Z'),
    ]);
    expect(m.get('a')!.leftPct).toBe(0);
    expect(m.get('b')!.leftPct).toBe(0);
  });

  it('all-day events get the default layout', () => {
    const m = computeOverlapMap([ev('a', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', true)]);
    expect(m.get('a')).toEqual({ leftPct: 0, rightPx: 3, zIndex: 100 });
  });
});
