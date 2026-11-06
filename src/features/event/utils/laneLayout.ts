import type { BusySlot, FreeBusyType, SuggestedSlot } from '@/types';
import { SNAP_MINUTES } from '@/features/calendar/utils/dragMath';

export const DAY_MINUTES = 24 * 60;

/** A minute range inside a day, e.g. the visible working-hours window. */
export interface MinuteRange {
  startMin: number;
  endMin: number;
}

export const FULL_DAY_RANGE: MinuteRange = { startMin: 0, endMin: DAY_MINUTES };

/** Fallback visible range when no attendee declares working hours (06:00–22:00). */
export const DEFAULT_WORKING_RANGE: MinuteRange = { startMin: 6 * 60, endMin: 22 * 60 };

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
 * midnight. FREE periods are skipped — they cancel nothing. When `range` is
 * given, blocks are additionally clamped to that window.
 */
export function blocksForDay(slots: BusySlot[], day: Date, range: MinuteRange = FULL_DAY_RANGE): LaneBlock[] {
  const dayStartMs = startOfDay(day).getTime();
  const dayEndMs = dayStartMs + DAY_MINUTES * 60_000;
  const rangeStartMs = dayStartMs + range.startMin * 60_000;
  const rangeEndMs = Math.min(dayEndMs, dayStartMs + range.endMin * 60_000);
  const blocks: LaneBlock[] = [];

  for (const slot of slots) {
    if (slot.fbType === 'FREE') continue;
    const s = Math.max(slot.start.getTime(), rangeStartMs);
    const e = Math.min(slot.end.getTime(), rangeEndMs);
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
 * Derive the common working-hours window for a day.
 *
 * The server encodes outside-working-hours as BUSY-UNAVAILABLE, so each
 * attendee's working window is the gap between their morning unavailable block
 * (covering 00:00) and their evening unavailable block (covering 24:00).
 * Attendees without unavailable blocks don't constrain the range.
 *
 * Returns the intersection across attendees; falls back to the union when the
 * intersection is empty, then to DEFAULT_WORKING_RANGE when nobody declares
 * working hours at all.
 */
export function workingRangeForDay(
  availabilities: { slots: BusySlot[] }[],
  day: Date,
): MinuteRange {
  const windows: MinuteRange[] = [];
  for (const a of availabilities) {
    const unavailable = blocksForDay(a.slots, day).filter((b) => b.fbType === 'BUSY-UNAVAILABLE');
    if (unavailable.length === 0) continue;
    const morning = unavailable.find((b) => b.startMin <= 0);
    const evening = unavailable.find((b) => b.endMin >= DAY_MINUTES);
    windows.push({
      startMin: morning ? morning.endMin : 0,
      endMin: evening ? evening.startMin : DAY_MINUTES,
    });
  }

  if (windows.length === 0) return DEFAULT_WORKING_RANGE;

  const startMin = Math.max(...windows.map((w) => w.startMin));
  const endMin = Math.min(...windows.map((w) => w.endMin));
  if (startMin < endMin) return { startMin, endMin };

  // Empty intersection (disjoint hours, or everyone off that day): union of
  // the non-empty windows, or the default range when nobody works that day.
  const usable = windows.filter((w) => w.startMin < w.endMin);
  if (usable.length === 0) return DEFAULT_WORKING_RANGE;
  return {
    startMin: Math.min(...usable.map((w) => w.startMin)),
    endMin: Math.max(...usable.map((w) => w.endMin)),
  };
}

/**
 * Compute the event placement from a tap on a lane.
 *
 * The tapped x offset is converted to minutes (starting at `rangeStartMin`),
 * snapped to `snapMinutes`, and the slot is returned if the event still fits
 * inside the day. Overlapping a busy period does NOT reject the placement —
 * the caller decides how to render a conflicting draft (e.g. red border,
 * disabled Apply).
 */
export function slotFromLaneTap(
  offsetXPx: number,
  pxPerMinute: number,
  day: Date,
  durationMs: number,
  rangeStartMin: number = 0,
  snapMinutes: number = SNAP_MINUTES,
): SuggestedSlot | null {
  if (pxPerMinute <= 0) return null;
  const dayStart = startOfDay(day);
  const rawMinutes = rangeStartMin + offsetXPx / pxPerMinute;
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
export function hourMarks(pxPerMinute: number, range: MinuteRange = FULL_DAY_RANGE): number[] {
  const stepHours = pxPerMinute >= 2 ? 1 : pxPerMinute >= 1 ? 3 : 6;
  const marks: number[] = [];
  const firstHour = Math.ceil(range.startMin / 60);
  const lastHour = Math.min(23, Math.floor(range.endMin / 60));
  for (let h = firstHour; h <= lastHour; h += stepHours) marks.push(h * 60);
  return marks;
}
