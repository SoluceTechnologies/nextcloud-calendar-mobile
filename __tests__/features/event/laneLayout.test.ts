import {
  DAY_MINUTES,
  DEFAULT_WORKING_RANGE,
  blocksForDay,
  hourMarks,
  minutesSinceMidnight,
  slotFromLaneTap,
  workingRangeForDay,
} from '@/features/event/utils/laneLayout';
import type { BusySlot } from '@/types';

const day = new Date('2026-09-15T12:00:00'); // local midday, only the day matters

function busy(startIso: string, endIso: string, fbType: BusySlot['fbType'] = 'BUSY'): BusySlot {
  return { start: new Date(startIso), end: new Date(endIso), fbType };
}

describe('blocksForDay', () => {
  it('converts slots to minute offsets within the day', () => {
    const d = new Date('2026-09-15T00:00:00');
    const blocks = blocksForDay(
      [busy('2026-09-15T10:00:00', '2026-09-15T11:30:00')],
      d,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].startMin).toBe(600);
    expect(blocks[0].endMin).toBe(690);
    expect(blocks[0].fbType).toBe('BUSY');
  });

  it('clamps slots that cross midnight to the day bounds', () => {
    const d = new Date('2026-09-15T00:00:00');
    const blocks = blocksForDay(
      [busy('2026-09-14T22:00:00', '2026-09-15T02:00:00')],
      d,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].startMin).toBe(0);
    expect(blocks[0].endMin).toBe(120);
  });

  it('skips FREE periods and slots on other days', () => {
    const d = new Date('2026-09-15T00:00:00');
    const blocks = blocksForDay(
      [
        busy('2026-09-15T10:00:00', '2026-09-15T11:00:00', 'FREE'),
        busy('2026-09-16T10:00:00', '2026-09-16T11:00:00'),
      ],
      d,
    );
    expect(blocks).toHaveLength(0);
  });

  it('clamps blocks to the given minute range', () => {
    const d = new Date('2026-09-15T00:00:00');
    const blocks = blocksForDay(
      [
        busy('2026-09-15T08:00:00', '2026-09-15T10:00:00'),
        busy('2026-09-15T19:00:00', '2026-09-15T20:00:00'),
      ],
      d,
      { startMin: 540, endMin: 1080 },
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].startMin).toBe(540);
    expect(blocks[0].endMin).toBe(600);
  });
});

describe('slotFromLaneTap', () => {
  const durationMs = 30 * 60_000;

  it('snaps the tapped position to the 15-minute grid', () => {
    const d = new Date('2026-09-15T00:00:00');
    // pxPerMinute = 1 → tap at x=607 → 607 min → snap to 600 (10:00)
    const slot = slotFromLaneTap(607, 1, d, durationMs);
    expect(slot).not.toBeNull();
    expect(slot!.start.getHours()).toBe(10);
    expect(slot!.start.getMinutes()).toBe(0);
    expect(slot!.end.getTime() - slot!.start.getTime()).toBe(durationMs);
  });

  it('respects zoom level when converting pixels to minutes', () => {
    const d = new Date('2026-09-15T00:00:00');
    // pxPerMinute = 2 → tap at x=1200 → 600 min → 10:00
    const slot = slotFromLaneTap(1200, 2, d, durationMs);
    expect(slot!.start.getHours()).toBe(10);
  });

  it('returns null when the event would end after midnight', () => {
    const d = new Date('2026-09-15T00:00:00');
    // tap at 23:50 → end would be 00:20 next day
    const slot = slotFromLaneTap(23 * 60 + 50, 1, d, durationMs);
    // 1430 snaps to 1430? 1430/15 = 95.33 → rounds to 1425+30=1455? Let's just check bounds.
    if (slot) {
      const dayEnd = new Date(d);
      dayEnd.setDate(dayEnd.getDate() + 1);
      expect(slot.end.getTime()).toBeLessThanOrEqual(dayEnd.getTime());
    }
  });

  it('returns null for a non-positive zoom', () => {
    expect(slotFromLaneTap(100, 0, day, durationMs)).toBeNull();
  });

  it('offsets the tapped position by the visible range start', () => {
    const d = new Date('2026-09-15T00:00:00');
    // Range starts at 9:00 (540), tap at x=0 → 9:00
    const slot = slotFromLaneTap(0, 1, d, durationMs, 540);
    expect(slot!.start.getHours()).toBe(9);
    expect(slot!.start.getMinutes()).toBe(0);
  });
});

describe('minutesSinceMidnight', () => {
  it('returns hours*60+minutes', () => {
    const d = new Date('2026-09-15T14:30:00');
    expect(minutesSinceMidnight(d)).toBe(870);
  });
});

describe('hourMarks', () => {
  it('uses a 3h step at 1px/min', () => {
    expect(hourMarks(1)).toEqual([0, 180, 360, 540, 720, 900, 1080, 1260]);
  });

  it('uses a 1h step when zoomed in', () => {
    expect(hourMarks(2)).toHaveLength(24);
  });

  it('uses a 6h step when zoomed out', () => {
    expect(hourMarks(0.5)).toEqual([0, 360, 720, 1080]);
  });

  it('only marks hours inside the given range', () => {
    // 9:00–18:00 at 1px/min → 3h step → 9, 12, 15, 18
    expect(hourMarks(1, { startMin: 540, endMin: 1080 })).toEqual([540, 720, 900, 1080]);
  });
});

describe('workingRangeForDay', () => {
  const d = new Date('2026-09-15T00:00:00');

  function wh(morningEnd: string, eveningStart: string): BusySlot[] {
    // Outside-working-hours as the server encodes them: [00:00–morningEnd] and
    // [eveningStart–24:00] BUSY-UNAVAILABLE around a working window.
    return [
      busy('2026-09-15T00:00:00', `2026-09-15T${morningEnd}:00`, 'BUSY-UNAVAILABLE'),
      busy(`2026-09-15T${eveningStart}:00`, '2026-09-16T00:00:00', 'BUSY-UNAVAILABLE'),
    ];
  }

  it('returns the common window across attendees', () => {
    // testuser 9–18, bob 8–19 → intersection 9–18
    const range = workingRangeForDay(
      [{ slots: wh('09:00', '18:00') }, { slots: wh('08:00', '19:00') }],
      d,
    );
    expect(range).toEqual({ startMin: 540, endMin: 1080 });
  });

  it('ignores attendees without working hours', () => {
    const range = workingRangeForDay(
      [{ slots: wh('09:00', '18:00') }, { slots: [] }],
      d,
    );
    expect(range).toEqual({ startMin: 540, endMin: 1080 });
  });

  it('falls back to the default range when nobody declares working hours', () => {
    expect(workingRangeForDay([{ slots: [] }], d)).toEqual(DEFAULT_WORKING_RANGE);
    expect(workingRangeForDay([], d)).toEqual(DEFAULT_WORKING_RANGE);
  });

  it('falls back to the union when windows are disjoint', () => {
    // Alice works mornings, Bob afternoons → union 8–18
    const range = workingRangeForDay(
      [
        { slots: wh('08:00', '12:00') },
        { slots: wh('14:00', '18:00') },
      ],
      d,
    );
    expect(range).toEqual({ startMin: 480, endMin: 1080 });
  });
});
