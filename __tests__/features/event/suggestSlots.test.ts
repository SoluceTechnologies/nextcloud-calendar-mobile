import { suggestSlots } from '@/features/event/utils/suggestSlots';
import type { BusySlot } from '@/types';

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

describe('suggestSlots', () => {
  const searchStart = new Date('2026-08-28T08:00:00Z');
  const searchEnd = new Date('2026-08-28T20:00:00Z');

  it('returns slots when there are no busy periods', () => {
    const slots = suggestSlots(HOUR, searchStart, searchEnd, []);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].start).toEqual(new Date('2026-08-28T08:00:00Z'));
    expect(slots[0].end.getTime() - slots[0].start.getTime()).toBe(HOUR);
  });

  it('skips slots that overlap busy periods', () => {
    const busy: BusySlot[] = [
      { start: new Date('2026-08-28T08:00Z'), end: new Date('2026-08-28T10:00Z'), fbType: 'BUSY' },
    ];
    const slots = suggestSlots(HOUR, searchStart, searchEnd, busy);
    // First free slot should be at 10:00
    expect(slots[0].start).toEqual(new Date('2026-08-28T10:00:00Z'));
  });

  it('respects maxSuggestions', () => {
    const slots = suggestSlots(HOUR, searchStart, searchEnd, [], { maxSuggestions: 3 });
    expect(slots).toHaveLength(3);
  });

  it('rounds start times to 15 minutes', () => {
    const oddStart = new Date('2026-08-28T08:07:30Z');
    const slots = suggestSlots(HOUR, oddStart, searchEnd, []);
    // 08:07:30 rounds up to 08:15
    expect(slots[0].start).toEqual(new Date('2026-08-28T08:15:00Z'));
  });

  it('respects custom roundMinutes', () => {
    const oddStart = new Date('2026-08-28T08:10:00Z');
    const slots = suggestSlots(HOUR, oddStart, searchEnd, [], { roundMinutes: 30 });
    // 08:10 rounds up to 08:30
    expect(slots[0].start).toEqual(new Date('2026-08-28T08:30:00Z'));
  });

  it('excludes slots that extend past searchEnd', () => {
    const shortEnd = new Date('2026-08-28T08:30:00Z');
    const slots = suggestSlots(HOUR, searchStart, shortEnd, []);
    // 08:00 + 1h = 09:00 > 08:30, so no slots
    expect(slots).toHaveLength(0);
  });

  it('handles adjacent busy periods correctly', () => {
    const busy: BusySlot[] = [
      { start: new Date('2026-08-28T08:00Z'), end: new Date('2026-08-28T09:00Z'), fbType: 'BUSY' },
      { start: new Date('2026-08-28T09:00Z'), end: new Date('2026-08-28T10:00Z'), fbType: 'BUSY' },
    ];
    const slots = suggestSlots(HOUR, searchStart, searchEnd, busy);
    expect(slots[0].start).toEqual(new Date('2026-08-28T10:00:00Z'));
  });

  it('skips BUSY-UNAVAILABLE periods (working hours)', () => {
    const busy: BusySlot[] = [
      { start: new Date('2026-08-28T08:00Z'), end: new Date('2026-08-28T09:00Z'), fbType: 'BUSY-UNAVAILABLE' },
    ];
    const slots = suggestSlots(HOUR, searchStart, searchEnd, busy);
    expect(slots[0].start).toEqual(new Date('2026-08-28T09:00:00Z'));
  });

  it('returns empty array when entire window is busy', () => {
    const busy: BusySlot[] = [
      { start: new Date('2026-08-28T08:00Z'), end: new Date('2026-08-28T20:00Z'), fbType: 'BUSY' },
    ];
    const slots = suggestSlots(HOUR, searchStart, searchEnd, busy);
    expect(slots).toHaveLength(0);
  });

  it('avoids busy periods from multiple attendees', () => {
    const busy: BusySlot[] = [
      { start: new Date('2026-08-28T09:00Z'), end: new Date('2026-08-28T10:00Z'), fbType: 'BUSY' },
      { start: new Date('2026-08-28T12:00Z'), end: new Date('2026-08-28T13:00Z'), fbType: 'BUSY' },
    ];
    const slots = suggestSlots(HOUR, searchStart, searchEnd, busy);
    expect(slots[0].start).toEqual(new Date('2026-08-28T08:00:00Z'));
    expect(slots[1].start).toEqual(new Date('2026-08-28T10:00:00Z'));

    for (const slot of slots) {
      const overlaps = busy.some(
        (b) => slot.start.getTime() < b.end.getTime() && b.start.getTime() < slot.end.getTime(),
      );
      expect(overlaps).toBe(false);
    }
  });

  it('returns empty when multiple attendees fill the day', () => {
    const busy: BusySlot[] = [
      { start: new Date('2026-08-28T08:00Z'), end: new Date('2026-08-28T12:00Z'), fbType: 'BUSY' },
      { start: new Date('2026-08-28T12:00Z'), end: new Date('2026-08-28T20:00Z'), fbType: 'BUSY' },
    ];
    const slots = suggestSlots(HOUR, searchStart, searchEnd, busy);
    expect(slots).toHaveLength(0);
  });
});
