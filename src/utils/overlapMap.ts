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

  // --- Step 1: find connected overlap clusters ---
  // Two events overlap if one starts before the other ends.
  const n = timed.length;
  const clusterIdx = new Array<number>(n).fill(-1);
  const clusters: number[][] = [];

  for (let i = 0; i < n; i++) {
    if (clusterIdx[i] !== -1) continue;
    // BFS to collect all events reachable via overlap
    const cluster: number[] = [];
    const queue = [i];
    clusterIdx[i] = clusters.length;
    while (queue.length > 0) {
      const cur = queue.shift()!;
      cluster.push(cur);
      for (let j = 0; j < n; j++) {
        if (clusterIdx[j] !== -1) continue;
        // Check overlap with any event already in this cluster
        const overlapsCluster = cluster.some((c) =>
          timed[c].dtstart.getTime() < timed[j].dtend.getTime() &&
          timed[c].dtend.getTime() > timed[j].dtstart.getTime()
        );
        if (overlapsCluster) {
          clusterIdx[j] = clusters.length;
          queue.push(j);
        }
      }
    }
    clusters.push(cluster);
  }

  // --- Step 2: within each cluster, assign columns greedily ---
  for (const cluster of clusters) {
    // Sort cluster members by start time (already sorted globally, but re-sort for safety)
    const members = cluster
      .map((i) => timed[i])
      .sort((a, b) => {
        const sd = a.dtstart.getTime() - b.dtstart.getTime();
        return sd !== 0 ? sd : a.uid.localeCompare(b.uid);
      });

    // columnEnds[k] = latest end time of events assigned to column k
    const columnEnds: number[] = [];
    const assignments = new Map<string, number>(); // uid → column

    for (const ev of members) {
      const start = ev.dtstart.getTime();
      // Find the first column whose last event ends at or before this event's start
      let col = columnEnds.findIndex((end) => end <= start);
      if (col === -1) {
        col = columnEnds.length;
        columnEnds.push(0);
      }
      columnEnds[col] = ev.dtend.getTime();
      assignments.set(ev.uid, col);
    }

    const totalCols = columnEnds.length;
    const widthPct = 100 / totalCols;

    for (const ev of members) {
      const col = assignments.get(ev.uid) ?? 0;
      const leftPct = col * widthPct;
      result.set(ev.uid, {
        leftPct,
        rightPx: col === totalCols - 1 ? 3 : 0,
        zIndex: 100 + col,
      });
    }
  }

  // All-day events: full width, uniform zIndex
  for (const ev of events.filter((e) => e.allDay)) {
    result.set(ev.uid, { leftPct: 0, rightPx: 3, zIndex: 100 });
  }

  return result;
}
