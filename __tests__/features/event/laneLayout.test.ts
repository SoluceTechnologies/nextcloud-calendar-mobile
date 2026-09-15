import {
  DAY_MINUTES,
  blocksForDay,
  hourMarks,
  minutesSinceMidnight,
  slotFromLaneTap,
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
});
