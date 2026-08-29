import ICAL from 'ical.js';
import type { BusySlot, FreeBusyType, AttendeeAvailability } from '@/types';

/**
 * Parse a VFREEBUSY iCalendar component and extract FREEBUSY periods.
 *
 * Each FREEBUSY property carries a FBTYPE parameter (BUSY, BUSY-UNAVAILABLE,
 * BUSY-TENTATIVE, FREE) and one or more period values formatted as
 * `start/end` (UTC timestamps).
 */
export function parseVFreeBusy(ics: string): BusySlot[] {
  let jcal: unknown;
  try {
    jcal = ICAL.parse(ics);
  } catch {
    return [];
  }

  const root = new ICAL.Component(jcal as ReturnType<typeof ICAL.parse>);
  const vfb = root.getFirstSubcomponent('vfreebusy');
  if (!vfb) return [];

  const slots: BusySlot[] = [];
  const props = vfb.getAllProperties('freebusy');
  for (const prop of props) {
    const fbType = ((prop.getParameter('fbtype') as string) ?? 'BUSY').toUpperCase() as FreeBusyType;
    const values = prop.getValues() as ICAL.Period[];
    for (const period of values) {
      if (!period || !period.start || !period.end) continue;
      slots.push({
        start: period.start.toJSDate(),
        end: period.end.toJSDate(),
        fbType,
      });
    }
  }

  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Merge overlapping or adjacent busy periods from multiple attendees into a
 * single sorted list. Only BUSY / BUSY-UNAVAILABLE / BUSY-TENTATIVE periods
 * are considered — FREE periods are ignored (they cancel nothing in the merge).
 */
export function mergeBusySlots(availabilities: AttendeeAvailability[]): BusySlot[] {
  const all: BusySlot[] = [];
  for (const avail of availabilities) {
    if (!avail.available) continue;
    for (const slot of avail.slots) {
      if (slot.fbType === 'FREE') continue;
      all.push(slot);
    }
  }

  if (all.length === 0) return [];
  all.sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged: BusySlot[] = [all[0]];
  for (let i = 1; i < all.length; i++) {
    const last = merged[merged.length - 1];
    const cur = all[i];
    if (cur.start.getTime() <= last.end.getTime()) {
      last.end = new Date(Math.max(last.end.getTime(), cur.end.getTime()));
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

/**
 * Check whether a candidate slot [start, end) does not overlap any busy period.
 * Adjacent periods (slot.end === busy.start or vice-versa) are considered free.
 */
export function isSlotFree(slot: { start: Date; end: Date }, busySlots: BusySlot[]): boolean {
  const s = slot.start.getTime();
  const e = slot.end.getTime();
  for (const busy of busySlots) {
    const bs = busy.start.getTime();
    const be = busy.end.getTime();
    if (s < be && bs < e) return false;
  }
  return true;
}
