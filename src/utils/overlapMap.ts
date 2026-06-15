/**
 * Greedy interval-graph column allocation.
 *
 * Each event gets a column index 0..N-1 such that no two overlapping events
 * share a column.  All events in the same overlap cluster share the same
 * total column count, so every event has identical width = 100% / N and
 * left = column * width.  This is the same algorithm used by Google Calendar
 * and correctly handles any number of simultaneous events — including pairs
 * with identical titles and durations.
 */

import type { CalendarEvent } from '@/types';

export const LAYER_LEFT_PCT = [0, 30, 55, 70, 80]; // kept for backward compat

interface Layout {
  leftPct: number;
  rightPx: number;
  zIndex: number;
}

export function computeOverlapMap(events: CalendarEvent[]): Map<string, Layout> {
  const result = new Map<string, Layout>();

  const timed = events
    .filter((e) => !e.allDay)
    .sort((a, b) => {
      const sd = a.dtstart.getTime() - b.dtstart.getTime();
      return sd !== 0 ? sd : a.uid.localeCompare(b.uid);
    });

  // Sweep line: with events sorted by start, an event joins the running cluster
  // iff it starts before the max end seen in that cluster. This produces the same
  // connected overlap groups as a full pairwise graph walk, in O(n log n).
  const n = timed.length;
  let i = 0;
  while (i < n) {
    let clusterMaxEnd = timed[i].dtend.getTime();
    let j = i + 1;
    while (j < n && timed[j].dtstart.getTime() < clusterMaxEnd) {
      clusterMaxEnd = Math.max(clusterMaxEnd, timed[j].dtend.getTime());
      j++;
    }

    // Greedy column packing within the cluster (members timed[i..j-1] are already
    // start-sorted): reuse the first column whose last event has ended.
    const columnEnds: number[] = [];
    const cols: number[] = [];
    for (let k = i; k < j; k++) {
      const start = timed[k].dtstart.getTime();
      let col = columnEnds.findIndex((end) => end <= start);
      if (col === -1) { col = columnEnds.length; columnEnds.push(0); }
      columnEnds[col] = timed[k].dtend.getTime();
      cols.push(col);
    }

    const totalCols = columnEnds.length;
    const widthPct = 100 / totalCols;
    for (let k = i; k < j; k++) {
      const col = cols[k - i];
      result.set(timed[k].uid, {
        leftPct: col * widthPct,
        rightPx: col === totalCols - 1 ? 3 : 0,
        zIndex: 100 + col,
      });
    }

    i = j;
  }

  for (const ev of events) {
    if (ev.allDay) result.set(ev.uid, { leftPct: 0, rightPx: 3, zIndex: 100 });
  }

  return result;
}
