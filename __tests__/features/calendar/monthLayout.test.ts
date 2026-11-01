import { dayKey } from '@/features/calendar/utils/grid';
import { layoutWeek, linesFor, monthWeeks } from '@/features/calendar/utils/monthLayout';
import type { CalendarEvent } from '@/types';

function ev(uid: string, dtstart: Date, dtend: Date, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    uid, href: `/${uid}.ics`, calendarId: 'c1', accountId: 'a1',
    summary: uid, dtstart, dtend, allDay: false, color: '#0082c9',
    attendees: [], isRecurring: false, ...extra,
  };
}

// Mon 2 Nov … Sun 8 Nov 2026
const week = monthWeeks(2026, 10, 1)[1];

describe('monthWeeks', () => {
  it('fills adjacent days: November 2026, Monday start', () => {
    const w = monthWeeks(2026, 10, 1);
    expect(w).toHaveLength(6);
    expect(dayKey(w[0][0])).toBe('2026-10-26');
    expect(dayKey(w[5][6])).toBe('2026-12-06');
    w.flat().forEach((d, i, all) => {
      if (i) expect(d.getTime()).toBeGreaterThan(all[i - 1].getTime());
    });
  });

  it('keeps distinct consecutive days across the DST switch (week of 2026-10-25)', () => {
    const keys = monthWeeks(2026, 9, 0).flat().map(dayKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('2026-10-25');
    expect(keys).toContain('2026-10-26');
  });
});

describe('linesFor', () => {
  it('derives the number of lines from the row height', () => {
    expect(linesFor(100)).toBe(4);
    expect(linesFor(120)).toBe(6);
    expect(linesFor(10)).toBe(1);
  });
});

describe('layoutWeek', () => {
  it('puts a multi-day all-day event in one bar above timed chips', () => {
    const bar = ev('ferien', new Date(2026, 10, 3), new Date(2026, 10, 5), { allDay: true });
    const chip = ev('daily', new Date(2026, 10, 3, 9), new Date(2026, 10, 3, 9, 15));
    const { segments } = layoutWeek(week, [chip, bar], 4);
    expect(segments.find((s) => s.event.uid === 'ferien')).toMatchObject({ col0: 1, col1: 3, lane: 0 });
    expect(segments.find((s) => s.event.uid === 'daily')).toMatchObject({ col0: 1, col1: 1, lane: 1 });
  });

  it('clips a bar crossing the week edge and flags it', () => {
    const bar = ev('shift', new Date(2026, 10, 6), new Date(2026, 10, 12), { allDay: true });
    expect(layoutWeek(week, [bar], 4).segments[0]).toMatchObject({
      col0: 4, col1: 6, continuesLeft: false, continuesRight: true,
    });
  });

  it('draws a timed event crossing midnight as a bar, one ending at midnight as a chip', () => {
    const night = ev('night', new Date(2026, 10, 3, 22), new Date(2026, 10, 4, 2));
    const late = ev('late', new Date(2026, 10, 3, 23), new Date(2026, 10, 4, 0));
    const { segments } = layoutWeek(week, [night, late], 4);
    expect(segments.find((s) => s.event.uid === 'night')).toMatchObject({ col0: 1, col1: 2 });
    expect(segments.find((s) => s.event.uid === 'late')).toMatchObject({ col0: 1, col1: 1 });
  });

  it('fills the free lane under a shorter bar with a chip', () => {
    const bar = ev('b', new Date(2026, 10, 2), new Date(2026, 10, 2), { allDay: true });
    const chip = ev('c', new Date(2026, 10, 3, 9), new Date(2026, 10, 3, 10));
    expect(layoutWeek(week, [bar, chip], 4).segments.find((s) => s.event.uid === 'c')!.lane).toBe(0);
  });

  it('draws 3 items and reports +3 when 6 fall on a 4-line day', () => {
    const items = [9, 10, 11, 12, 13, 14].map((h) =>
      ev(`t${h}`, new Date(2026, 10, 4, h), new Date(2026, 10, 4, h, 30)));
    const r = layoutWeek(week, items, 4);
    expect(r.segments.filter((s) => s.col0 === 2)).toHaveLength(3);
    expect(r.more).toEqual([{ col: 2, count: 3 }]);
  });

  it('splits a bar around a day where its lane is hidden', () => {
    // top: Mon–Thu lane 0; long: Tue–Thu lane 1; extra: Wed chip lane 2.
    // lines = 2 → Wed (3 items) shows only lane 0, so `long` is split around it.
    const top = ev('top', new Date(2026, 10, 2), new Date(2026, 10, 5), { allDay: true });
    const long = ev('long', new Date(2026, 10, 3), new Date(2026, 10, 5), { allDay: true });
    const extra = ev('extra', new Date(2026, 10, 4, 9), new Date(2026, 10, 4, 10));
    const r = layoutWeek(week, [extra, long, top], 2);
    const runs = r.segments.filter((s) => s.event.uid === 'long');
    expect(runs.map((s) => [s.col0, s.col1])).toEqual([[1, 1], [3, 3]]);
    expect(runs[0].continuesRight).toBe(true);
    expect(runs[1].continuesLeft).toBe(true);
    expect(r.more).toEqual([{ col: 2, count: 2 }]);
  });

  it('with one line, shows a lone item and collapses two items to +2', () => {
    const one = ev('one', new Date(2026, 10, 2, 9), new Date(2026, 10, 2, 10));
    const twoA = ev('a', new Date(2026, 10, 3, 9), new Date(2026, 10, 3, 10));
    const twoB = ev('b', new Date(2026, 10, 3, 11), new Date(2026, 10, 3, 12));
    const r = layoutWeek(week, [one, twoA, twoB], 1);
    expect(r.segments.map((s) => s.event.uid)).toEqual(['one']);
    expect(r.more).toEqual([{ col: 1, count: 2 }]);
  });

  it('ignores events outside the week', () => {
    const outside = ev('x', new Date(2026, 10, 20, 9), new Date(2026, 10, 20, 10));
    expect(layoutWeek(week, [outside], 4).segments).toEqual([]);
  });

  it('never draws "+N" over a visible chip when bars are staggered', () => {
    // lines = 2. A Mon–Wed lane 0, B Tue–Thu lane 1, C Wed–Fri lane 2.
    // Thu holds B (lane 1) and C (lane 2): "+N" takes lane 1, so B must hide there too.
    const a = ev('A', new Date(2026, 10, 2), new Date(2026, 10, 4), { allDay: true });
    const b = ev('B', new Date(2026, 10, 3), new Date(2026, 10, 5), { allDay: true });
    const c = ev('C', new Date(2026, 10, 4), new Date(2026, 10, 6), { allDay: true });
    const r = layoutWeek(week, [a, b, c], 2);
    for (const { col } of r.more) {
      expect(r.segments.some((s) => s.lane >= 1 && s.col0 <= col && col <= s.col1)).toBe(false);
    }
    expect(r.more).toContainEqual({ col: 3, count: 2 });
  });
});
