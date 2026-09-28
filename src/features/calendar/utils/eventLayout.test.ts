import { layoutDay, MIN_EVENT_WIDTH_PCT } from '@/features/calendar/utils/eventLayout';
import type { GridEvent } from '@/features/calendar/utils/toGridEvents';
import type { CalendarEvent } from '@/types';

function ev(uid: string, startHour: number, endHour: number): GridEvent {
  const e: CalendarEvent = {
    uid, href: `/${uid}.ics`, calendarId: 'c1', accountId: 'a1',
    summary: uid,
    dtstart: new Date(2026, 7, 7, startHour, 0),
    dtend: new Date(2026, 7, 7, endHour, 0),
    allDay: false, color: '#0082c9', attendees: [], isRecurring: false,
  };
  return {
    title: e.summary, start: e.dtstart, end: e.dtend, color: e.color,
    _event: e,
  };
}

function evAt(uid: string, startMin: number, endMin: number): GridEvent {
  const base = ev(uid, 0, 1);
  base.start = new Date(2026, 7, 7, Math.floor(startMin / 60), startMin % 60);
  base.end = new Date(2026, 7, 7, Math.floor(endMin / 60), endMin % 60);
  base._event.dtstart = base.start;
  base._event.dtend = base.end;
  return base;
}

const byUid = (out: ReturnType<typeof layoutDay>) =>
  new Map(out.map((p) => [p.event._event.uid, p]));

describe('layoutDay', () => {
  it('gives a lone event the full width', () => {
    const [only] = layoutDay([ev('a', 9, 10)]);
    expect(only.leftPct).toBe(0);
    expect(only.widthPct).toBe(100);
  });

  it('leaves disjoint events at full width each', () => {
    const out = byUid(layoutDay([ev('a', 9, 10), ev('b', 11, 12)]));
    expect(out.get('a')!.widthPct).toBe(100);
    expect(out.get('b')!.widthPct).toBe(100);
    expect(out.get('b')!.leftPct).toBe(0);
  });

  it('treats touching edges as disjoint', () => {
    const out = byUid(layoutDay([ev('a', 9, 10), ev('b', 10, 11)]));
    expect(out.get('a')!.widthPct).toBe(100);
    expect(out.get('b')!.widthPct).toBe(100);
  });

  it('splits two simultaneous events in half', () => {
    const out = byUid(layoutDay([ev('a', 9, 11), ev('b', 10, 12)]));
    expect(out.get('a')!.leftPct).toBe(0);
    expect(out.get('a')!.widthPct).toBe(50);
    expect(out.get('b')!.leftPct).toBe(50);
    expect(out.get('b')!.widthPct).toBe(50);
  });

  it('expands an event into the free column to its right', () => {
    const out = byUid(layoutDay([ev('a', 9, 10), evAt('b', 570, 660), ev('c', 10, 12)]));
    expect(out.get('a')!.widthPct).toBe(50);
    expect(out.get('b')!.widthPct).toBe(50);
  });

  it('legitimately expands an event when freed columns do not overlap it', () => {
    const out = byUid(layoutDay([ev('a', 9, 10), ev('b', 9, 10), evAt('d', 570, 630), ev('c', 10, 11)]));
    expect(out.get('c')!.leftPct).toBe(0);
    expect(out.get('c')!.widthPct).toBeCloseTo(100 * (2 / 3), 6);
    expect(out.get('a')!.widthPct).toBe(100);
    expect(out.get('b')!.widthPct).toBeCloseTo(70, 6);
    expect(out.get('d')!.widthPct).toBe(MIN_EVENT_WIDTH_PCT);
  });

  it('lets an event span every column when nothing overlaps it', () => {
    const out = byUid(layoutDay([ev('a', 8, 9), ev('b', 10, 11), evAt('c', 630, 690)]));
    expect(out.get('a')!.widthPct).toBe(100);
    expect(out.get('b')!.widthPct).toBe(50);
  });

  it('cascades three simultaneous events, background widest and top at the floor', () => {
    const out = byUid(layoutDay([ev('a', 9, 12), ev('b', 9, 12), ev('c', 9, 12)]));
    expect(out.get('a')!.leftPct).toBe(0);
    expect(out.get('a')!.widthPct).toBe(100);
    expect(out.get('b')!.leftPct).toBeCloseTo(30, 6);
    expect(out.get('b')!.widthPct).toBeCloseTo(70, 6);
    expect(out.get('c')!.leftPct).toBeCloseTo(60, 6);
    expect(out.get('c')!.widthPct).toBe(MIN_EVENT_WIDTH_PCT);
    expect(new Set([...out.values()].map((p) => p.leftPct)).size).toBe(3);
  });

  it('never emits a zero or negative width', () => {
    const many = Array.from({ length: 20 }, (_, i) => ev(`e${i}`, 9, 17));
    for (const p of layoutDay(many)) {
      expect(p.widthPct).toBeGreaterThan(0);
    }
  });

  it('does not let one long event narrow the whole day', () => {
    const slices = [
      ev('span', 0, 24),
      ...Array.from({ length: 20 }, (_, i) => ev(`e${i}`, 9 + (i % 8), 9 + (i % 8) + 1)),
    ];
    const out = layoutDay(slices);
    const narrowest = Math.min(...out.map((p) => p.widthPct));
    expect(narrowest).toBeGreaterThan(100 / 6);
  });

  it('orders ties by uid so columns do not flicker between renders', () => {
    const first = layoutDay([ev('b', 9, 10), ev('a', 9, 10)]);
    const second = layoutDay([ev('a', 9, 10), ev('b', 9, 10)]);
    expect(first.map((p) => p.event._event.uid)).toEqual(second.map((p) => p.event._event.uid));
    expect(first.map((p) => p.leftPct)).toEqual(second.map((p) => p.leftPct));
  });

  it('returns an empty list for an empty day', () => {
    expect(layoutDay([])).toEqual([]);
  });

  it('assigns the base zIndex to a lone event', () => {
    const out = byUid(layoutDay([ev('a', 9, 10), ev('b', 11, 12)]));
    expect(out.get('a')!.zIndex).toBe(100);
    expect(out.get('b')!.zIndex).toBe(100);
  });

  it('increments zIndex per column for overlapping events', () => {
    const out = byUid(layoutDay([evAt('a', 540, 630), evAt('b', 600, 660)]));
    expect(out.get('a')!.zIndex).toBe(100);
    expect(out.get('b')!.zIndex).toBe(101);
  });

  it('reuses a freed column across a chain even when its endpoints are disjoint', () => {
    const out = byUid(layoutDay([ev('a', 9, 10), evAt('b', 570, 660), evAt('c', 630, 690)]));
    expect(out.get('a')!.leftPct).toBe(0);
    expect(out.get('b')!.leftPct).toBe(50);
    expect(out.get('c')!.leftPct).toBe(0);
    expect(out.get('a')!.widthPct).toBe(50);
    expect(out.get('b')!.widthPct).toBe(50);
    expect(out.get('c')!.widthPct).toBe(50);
  });
});

describe('layoutDay dense stacking', () => {
  const simultaneous = (n: number) =>
    Array.from({ length: n }, (_, i) => ev(`e${i}`, 9, 12));

  it('still shares equally while every event clears the floor', () => {
    const out = byUid(layoutDay(simultaneous(2)));
    expect(out.get('e0')!.widthPct).toBe(50);
    expect(out.get('e1')!.widthPct).toBe(50);
    expect(out.get('e1')!.leftPct).toBe(50);
  });

  it('holds the floor for the topmost box and widens the ones behind it', () => {
    const out = byUid(layoutDay(simultaneous(8)));
    expect(out.get('e0')!.widthPct).toBe(100);
    expect(out.get('e7')!.widthPct).toBe(MIN_EVENT_WIDTH_PCT);
    for (const p of out.values()) expect(p.widthPct).toBeGreaterThanOrEqual(MIN_EVENT_WIDTH_PCT);
    const byColumn = [...out.values()].sort((a, b) => a.leftPct - b.leftPct);
    for (let i = 1; i < byColumn.length; i++) {
      expect(byColumn[i].widthPct).toBeLessThan(byColumn[i - 1].widthPct);
    }
  });

  it('spreads dense columns so the last one ends at the right edge', () => {
    const out = byUid(layoutDay(simultaneous(8)));
    expect(out.get('e0')!.leftPct).toBe(0);
    expect(out.get('e7')!.leftPct + MIN_EVENT_WIDTH_PCT).toBeCloseTo(100, 6);
  });

  it('offsets dense columns evenly', () => {
    const out = layoutDay(simultaneous(5)).sort((a, b) => a.leftPct - b.leftPct);
    const steps = out.slice(1).map((p, i) => p.leftPct - out[i].leftPct);
    for (const step of steps) expect(step).toBeCloseTo((100 - MIN_EVENT_WIDTH_PCT) / 4, 6);
  });

  it('switches to cascade exactly at the floor', () => {
    const three = byUid(layoutDay(simultaneous(3)));
    expect(three.get('e0')!.widthPct).toBe(100);
    expect(three.get('e2')!.widthPct).toBe(MIN_EVENT_WIDTH_PCT);
    const two = layoutDay(simultaneous(2));
    for (const p of two) expect(p.widthPct).toBe(50);
  });

  it('never emits a zero width, dense or not', () => {
    for (const n of [1, 2, 3, 8, 20]) {
      for (const p of layoutDay(simultaneous(n))) {
        expect(p.widthPct).toBeGreaterThan(0);
      }
    }
  });

  it('leaves an expanded event alone when its span clears the floor', () => {
    const out = byUid(
      layoutDay([ev('a', 9, 10), ev('b', 9, 10), evAt('d', 570, 630), ev('c', 10, 11)])
    );
    expect(out.get('c')!.widthPct).toBeCloseTo(100 * (2 / 3), 6);
    expect(out.get('a')!.widthPct).toBe(100);
    expect(out.get('b')!.widthPct).toBeCloseTo(70, 6);
    expect(out.get('d')!.widthPct).toBe(MIN_EVENT_WIDTH_PCT);
  });
});
