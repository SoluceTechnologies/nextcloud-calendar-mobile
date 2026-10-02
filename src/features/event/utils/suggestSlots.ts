import type { BusySlot, SuggestedSlot } from '@/types';
import { isSlotFree } from '@/utils/freeBusy';

interface SuggestSlotsOptions {
  /** Round candidate start times to this many minutes. Default: 15. */
  roundMinutes?: number;
  /** Maximum number of suggestions to return. Default: 10. */
  maxSuggestions?: number;
}

/**
 * Suggest free time slots of a given duration within a search window.
 *
 * The algorithm walks the search range in steps of `roundMinutes` and returns
 * the first `maxSuggestions` slots that do not overlap any busy period.
 * Working hours are already encoded as BUSY-UNAVAILABLE by the server, so no
 * client-side filtering is needed.
 */
export function suggestSlots(
  durationMs: number,
  searchStart: Date,
  searchEnd: Date,
  mergedBusy: BusySlot[],
  options: SuggestSlotsOptions = {},
): SuggestedSlot[] {
  const roundMinutes = options.roundMinutes ?? 15;
  const maxSuggestions = options.maxSuggestions ?? 10;
  const stepMs = roundMinutes * 60_000;

  // Round the search start up to the next `roundMinutes` boundary.
  const startMs = searchStart.getTime();
  const roundedStart = Math.ceil(startMs / stepMs) * stepMs;

  const endMs = searchEnd.getTime();
  const suggestions: SuggestedSlot[] = [];

  for (let t = roundedStart; t + durationMs <= endMs && suggestions.length < maxSuggestions; t += stepMs) {
    const slotStart = new Date(t);
    const slotEnd = new Date(t + durationMs);
    if (isSlotFree({ start: slotStart, end: slotEnd }, mergedBusy)) {
      suggestions.push({ start: slotStart, end: slotEnd });
    }
  }

  return suggestions;
}
