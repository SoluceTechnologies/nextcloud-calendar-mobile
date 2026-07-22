import { expansionHorizon, needsHorizonReset } from '../../src/features/calendar/utils/horizon';

describe('expansionHorizon', () => {
  it('spans 18 months on each side of now', () => {
    const now = new Date('2026-07-22T12:00:00Z');
    const { start, end } = expansionHorizon(now);
    expect(start.getUTCFullYear()).toBe(2025);
    expect(start.getUTCMonth()).toBe(0); // Jan 2026 - 18mo = Jan 2025
    expect(end.getUTCFullYear()).toBe(2028);
    expect(end.getUTCMonth()).toBe(0); // Jul 2026 + 18mo = Jan 2028
  });
});

describe('needsHorizonReset', () => {
  const now = new Date('2026-07-22T00:00:00Z');
  it('is true when there is no stored center', () => {
    expect(needsHorizonReset(undefined, now)).toBe(true);
  });
  it('is false when center is within 6 months', () => {
    const center = new Date('2026-05-01T00:00:00Z').getTime();
    expect(needsHorizonReset(center, now)).toBe(false);
  });
  it('is true when center drifted more than 6 months', () => {
    const center = new Date('2025-12-01T00:00:00Z').getTime();
    expect(needsHorizonReset(center, now)).toBe(true);
  });
});
