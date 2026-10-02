import {
  resolveDraggedBounds,
  shiftMinutes,
  snapDeltaMinutes,
} from '@/features/calendar/utils/dragMath';

describe('snapDeltaMinutes', () => {
  it('snaps a one-hour drag to 60 minutes', () => {
    expect(snapDeltaMinutes(64, 64, 15)).toBe(60);
  });

  it('snaps to the nearest step', () => {
    expect(snapDeltaMinutes(16, 64, 15)).toBe(15);
    expect(snapDeltaMinutes(5, 64, 15)).toBe(0);
    expect(snapDeltaMinutes(10, 64, 15)).toBe(15);
  });

  it('handles upward (negative) drags', () => {
    expect(snapDeltaMinutes(-64, 64, 15)).toBe(-60);
    expect(snapDeltaMinutes(-32, 64, 30)).toBe(-30);
  });

  it('returns 0 for a degenerate grid', () => {
    expect(snapDeltaMinutes(50, 0, 15)).toBe(0);
    expect(snapDeltaMinutes(50, 64, 0)).toBe(0);
  });
});

describe('shiftMinutes', () => {
  it('returns a new date shifted by the given minutes', () => {
    const base = new Date(2026, 0, 1, 9, 0, 0);
    const later = shiftMinutes(base, 90);
    expect(later.getHours()).toBe(10);
    expect(later.getMinutes()).toBe(30);
    expect(base.getHours()).toBe(9);
  });
});

describe('resolveDraggedBounds', () => {
  const start = new Date(2026, 0, 1, 9, 0, 0);
  const end = new Date(2026, 0, 1, 10, 0, 0);

  it('moves both edges by the same delta', () => {
    const next = resolveDraggedBounds(start, end, 30, 30, 15);
    expect(next?.start.getMinutes()).toBe(30);
    expect(next?.end.getHours()).toBe(10);
    expect(next?.end.getMinutes()).toBe(30);
  });

  it('resizes by moving only the end edge', () => {
    const next = resolveDraggedBounds(start, end, 0, 30, 15);
    expect(next?.start.getTime()).toBe(start.getTime());
    expect(next?.end.getMinutes()).toBe(30);
  });

  it('does not mutate the inputs', () => {
    resolveDraggedBounds(start, end, 30, 30, 15);
    expect(start.getHours()).toBe(9);
    expect(end.getHours()).toBe(10);
  });

  it('returns null when a resize collapses below one step', () => {
    expect(resolveDraggedBounds(start, end, 0, -50, 15)).toBeNull();
  });

  it('allows a resize down to exactly one step', () => {
    const next = resolveDraggedBounds(start, end, 0, -45, 15);
    expect(next).not.toBeNull();
    expect(next?.end.getMinutes()).toBe(15);
  });

  it('never rejects a pure move, however large', () => {
    expect(resolveDraggedBounds(start, end, -600, -600, 15)).not.toBeNull();
  });

  it('moves an event already shorter than one step without rejecting it', () => {
    const short = new Date(2026, 0, 1, 9, 10, 0);
    const moved = resolveDraggedBounds(start, short, 30, 30, 15);
    if (!moved) throw new Error('expected the move to be accepted');
    expect(moved.start.getMinutes()).toBe(30);
    expect(moved.end.getTime() - moved.start.getTime()).toBe(10 * 60_000);
  });

  it('still rejects shrinking a sub-step event further', () => {
    const short = new Date(2026, 0, 1, 9, 10, 0);
    expect(resolveDraggedBounds(start, short, 0, -5, 15)).toBeNull();
  });
});
