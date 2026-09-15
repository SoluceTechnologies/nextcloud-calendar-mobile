import type { BusySlot, FreeBusyType, SuggestedSlot } from '@/types';
import { SNAP_MINUTES } from '@/features/calendar/utils/dragMath';

export const DAY_MINUTES = 24 * 60;

export interface LaneBlock {
  /** Minutes since start of day. */
  startMin: number;
  endMin: number;
  fbType: FreeBusyType;
}

function startOfDay(d: Date): Date {
  const result = new Date(d);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Clamp busy slots to a single day and express them as minute offsets from
 * midnight. FREE periods are skipped — they cancel nothing.
 */
export function blocksForDay(slots: BusySlot[], day: Date): LaneBlock[] {
  const dayStartMs = startOfDay(day).getTime();
  const dayEndMs = dayStartMs + DAY_MINUTES * 60_000;
  const blocks: LaneBlock[] = [];

  for (const slot of slots) {
    if (slot.fbType === 'FREE') continue;
    const s = Math.max(slot.start.getTime(), dayStartMs);
    const e = Math.min(slot.end.getTime(), dayEndMs);
    if (e <= s) continue;
    blocks.push({
      startMin: (s - dayStartMs) / 60_000,
      endMin: (e - dayStartMs) / 60_000,
      fbType: slot.fbType,
    });
  }

  return blocks;
}

/**
 * Compute the event placement from a tap on a lane.
 *
 * The tapped x offset is converted to minutes, snapped to `snapMinutes`, and
 * the slot is returned if the event still fits inside the day. Overlapping a
 * busy period does NOT reject the placement — the caller decides how to render
 * a conflicting draft (e.g. red border, disabled Apply).
 */
export function slotFromLaneTap(
  offsetXPx: number,
  pxPerMinute: number,
  day: Date,
  durationMs: number,
  snapMinutes: number = SNAP_MINUTES,
): SuggestedSlot | null {
  if (pxPerMinute <= 0) return null;
  const dayStart = startOfDay(day);
  const rawMinutes = offsetXPx / pxPerMinute;
  const snappedMin = Math.max(0, Math.round(rawMinutes / snapMinutes) * snapMinutes);
  const start = new Date(dayStart.getTime() + snappedMin * 60_000);
  const end = new Date(start.getTime() + durationMs);
  const dayEnd = new Date(dayStart.getTime() + DAY_MINUTES * 60_000);
  if (end.getTime() > dayEnd.getTime()) return null;
  return { start, end };
}

/** Minutes since midnight for a date, clamped to [0, DAY_MINUTES]. */
export function minutesSinceMidnight(d: Date): number {
  return Math.min(DAY_MINUTES, Math.max(0, d.getHours() * 60 + d.getMinutes()));
}

/** Hour marks to label on the lane axis, adapted to the current zoom. */
export function hourMarks(pxPerMinute: number): number[] {
  const stepHours = pxPerMinute >= 2 ? 1 : pxPerMinute >= 1 ? 3 : 6;
  const marks: number[] = [];
  for (let h = 0; h < 24; h += stepHours) marks.push(h * 60);
  return marks;
}
