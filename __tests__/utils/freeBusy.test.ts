import { parseVFreeBusy, mergeBusySlots, isSlotFree } from '@/utils/freeBusy';
import type { AttendeeAvailability, BusySlot } from '@/types';

describe('parseVFreeBusy', () => {
  const vfreebusyIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VFREEBUSY
UID:fb-1
DTSTAMP:20260828T100000Z
DTSTART:20260828T000000Z
DTEND:20260829T000000Z
FREEBUSY:20260828T100000Z/20260828T110000Z
FREEBUSY;FBTYPE=BUSY-UNAVAILABLE:20260828T080000Z/20260828T100000Z
FREEBUSY;FBTYPE=BUSY-TENTATIVE:20260828T140000Z/20260828T150000Z
END:VFREEBUSY
END:VCALENDAR`;

  it('extracts FREEBUSY periods with default BUSY type', () => {
    const slots = parseVFreeBusy(vfreebusyIcs);
    expect(slots).toHaveLength(3);
    const busy = slots.find((s) => s.fbType === 'BUSY');
    expect(busy).toBeDefined();
    expect(busy!.start.toISOString()).toBe('2026-08-28T10:00:00.000Z');
    expect(busy!.end.toISOString()).toBe('2026-08-28T11:00:00.000Z');
  });

  it('extracts BUSY-UNAVAILABLE periods', () => {
    const slots = parseVFreeBusy(vfreebusyIcs);
    const unavail = slots.find((s) => s.fbType === 'BUSY-UNAVAILABLE');
    expect(unavail).toBeDefined();
    expect(unavail!.start.toISOString()).toBe('2026-08-28T08:00:00.000Z');
  });

  it('extracts BUSY-TENTATIVE periods', () => {
    const slots = parseVFreeBusy(vfreebusyIcs);
    const tentative = slots.find((s) => s.fbType === 'BUSY-TENTATIVE');
    expect(tentative).toBeDefined();
    expect(tentative!.start.toISOString()).toBe('2026-08-28T14:00:00.000Z');
  });

  it('returns empty array for invalid ICS', () => {
    expect(parseVFreeBusy('not valid ics')).toEqual([]);
  });

  it('returns empty array when no VFREEBUSY component', () => {
    const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:e1\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
    expect(parseVFreeBusy(ics)).toEqual([]);
  });

  it('sorts slots by start time', () => {
    const slots = parseVFreeBusy(vfreebusyIcs);
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].start.getTime()).toBeGreaterThanOrEqual(slots[i - 1].start.getTime());
    }
  });
});

describe('mergeBusySlots', () => {
  const slot = (s: string, e: string, fbType: BusySlot['fbType'] = 'BUSY'): BusySlot => ({
    start: new Date(s),
    end: new Date(e),
    fbType,
  });

  it('returns empty for no availabilities', () => {
    expect(mergeBusySlots([])).toEqual([]);
  });

  it('ignores unavailable attendees', () => {
    const avails: AttendeeAvailability[] = [
      { email: 'a@x.com', slots: [], available: false },
    ];
    expect(mergeBusySlots(avails)).toEqual([]);
  });

  it('ignores FREE periods', () => {
    const avails: AttendeeAvailability[] = [
      { email: 'a@x.com', slots: [slot('2026-08-28T10:00Z', '2026-08-28T11:00Z', 'FREE')], available: true },
    ];
    expect(mergeBusySlots(avails)).toEqual([]);
  });

  it('merges overlapping periods from multiple attendees', () => {
    const avails: AttendeeAvailability[] = [
      { email: 'a@x.com', slots: [slot('2026-08-28T10:00Z', '2026-08-28T11:00Z')], available: true },
      { email: 'b@x.com', slots: [slot('2026-08-28T10:30Z', '2026-08-28T11:30Z')], available: true },
    ];
    const merged = mergeBusySlots(avails);
    expect(merged).toHaveLength(1);
    expect(merged[0].start.toISOString()).toBe('2026-08-28T10:00:00.000Z');
    expect(merged[0].end.toISOString()).toBe('2026-08-28T11:30:00.000Z');
  });

  it('keeps non-overlapping periods separate', () => {
    const avails: AttendeeAvailability[] = [
      { email: 'a@x.com', slots: [slot('2026-08-28T10:00Z', '2026-08-28T11:00Z')], available: true },
      { email: 'b@x.com', slots: [slot('2026-08-28T14:00Z', '2026-08-28T15:00Z')], available: true },
    ];
    const merged = mergeBusySlots(avails);
    expect(merged).toHaveLength(2);
  });

  it('merges adjacent periods', () => {
    const avails: AttendeeAvailability[] = [
      { email: 'a@x.com', slots: [slot('2026-08-28T10:00Z', '2026-08-28T11:00Z')], available: true },
      { email: 'b@x.com', slots: [slot('2026-08-28T11:00Z', '2026-08-28T12:00Z')], available: true },
    ];
    const merged = mergeBusySlots(avails);
    expect(merged).toHaveLength(1);
    expect(merged[0].end.toISOString()).toBe('2026-08-28T12:00:00.000Z');
  });
});

describe('isSlotFree', () => {
  const busy: BusySlot[] = [
    { start: new Date('2026-08-28T10:00Z'), end: new Date('2026-08-28T11:00Z'), fbType: 'BUSY' },
  ];

  it('returns true when slot does not overlap any busy period', () => {
    expect(isSlotFree({ start: new Date('2026-08-28T12:00Z'), end: new Date('2026-08-28T13:00Z') }, busy)).toBe(true);
  });

  it('returns false when slot overlaps a busy period', () => {
    expect(isSlotFree({ start: new Date('2026-08-28T10:30Z'), end: new Date('2026-08-28T11:30Z') }, busy)).toBe(false);
  });

  it('returns true for adjacent slots (no overlap)', () => {
    expect(isSlotFree({ start: new Date('2026-08-28T11:00Z'), end: new Date('2026-08-28T12:00Z') }, busy)).toBe(true);
    expect(isSlotFree({ start: new Date('2026-08-28T09:00Z'), end: new Date('2026-08-28T10:00Z') }, busy)).toBe(true);
  });

  it('returns false when slot is fully inside a busy period', () => {
    expect(isSlotFree({ start: new Date('2026-08-28T10:15Z'), end: new Date('2026-08-28T10:45Z') }, busy)).toBe(false);
  });

  it('returns true when there are no busy slots', () => {
    expect(isSlotFree({ start: new Date('2026-08-28T10:00Z'), end: new Date('2026-08-28T11:00Z') }, [])).toBe(true);
  });
});
