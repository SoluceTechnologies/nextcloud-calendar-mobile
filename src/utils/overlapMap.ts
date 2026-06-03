// Layered layout: longer events sit in the background at full width;
// shorter overlapping events appear as inset cards on top.
//
// For each event, compute its `layer` = its sorted position among all events
// that overlap it, ranked by duration descending (longest → layer 0 = background).
// Events at the same layer that also overlap each other get equal sub-columns
// within their shared horizontal band.
//
// Left-offset bands per layer:
//   layer 0 (background): 0 % → full width
//   layer 1             : 30 %
//   layer 2             : 55 %
//   layer 3             : 70 %
//   layer 4+            : 80 %

import type { CalendarEvent } from '@/types';

export const LAYER_LEFT_PCT = [0, 30, 55, 70, 80];

export function computeOverlapMap(
  events: CalendarEvent[],
): Map<string, { leftPct: number; rightPx: number; zIndex: number }> {
  const result = new Map<string, { leftPct: number; rightPx: number; zIndex: number }>();

  const timed = events.filter((e) => !e.allDay);

  for (const ev of timed) {
    const evStart = ev.dtstart.getTime();
    const evEnd = ev.dtend.getTime();
    const evDur = evEnd - evStart;

    // All events that overlap this event, sorted by duration desc → determines layer
    const overlapping = timed
      .filter((o) => o.dtstart.getTime() < evEnd && o.dtend.getTime() > evStart)
      .sort((a, b) => {
        const durDiff = (b.dtend.getTime() - b.dtstart.getTime()) - (a.dtend.getTime() - a.dtstart.getTime());
        if (durDiff !== 0) return durDiff;
        const startDiff = a.dtstart.getTime() - b.dtstart.getTime();
        return startDiff !== 0 ? startDiff : a.uid.localeCompare(b.uid);
      });

    const layer = overlapping.findIndex((o) => o.uid === ev.uid);

    // Among events at the SAME layer that also overlap each other, split horizontally
    const sameLayer = overlapping.filter((o) => {
      if (o.uid === ev.uid) return true;
      const oDur = o.dtend.getTime() - o.dtstart.getTime();
      // Same layer = same duration bucket (within the sorted list at this layer index)
      const oIdx = overlapping.findIndex((x) => x.uid === o.uid);
      return oIdx === layer;
    });
    // Actually, peers are events at the same sorted-layer index among overlapping
    // Use a simpler approach: find all events that have the same layer value when computed
    // against THIS event's overlapping set. Peers = events whose own layer (vs ev) is also `layer`.
    const peers = overlapping.filter((o) => {
      if (o.uid === ev.uid) return true;
      // o is a peer if ev and o have the same relative rank in each other's overlap groups
      const oOverlapping = timed
        .filter((x) => x.dtstart.getTime() < o.dtend.getTime() && x.dtend.getTime() > o.dtstart.getTime())
        .sort((a, b) => {
          const d = (b.dtend.getTime() - b.dtstart.getTime()) - (a.dtend.getTime() - a.dtstart.getTime());
          if (d !== 0) return d;
          const s = a.dtstart.getTime() - b.dtstart.getTime();
          return s !== 0 ? s : a.uid.localeCompare(b.uid);
        });
      return oOverlapping.findIndex((x) => x.uid === o.uid) === layer;
    });

    // Among peers, assign a sub-column so they sit side-by-side within the layer band
    const peersSorted = peers.sort((a, b) => {
      const s = a.dtstart.getTime() - b.dtstart.getTime();
      return s !== 0 ? s : a.uid.localeCompare(b.uid);
    });
    const peerCount = peersSorted.length;
    const peerIdx = peersSorted.findIndex((o) => o.uid === ev.uid);

    const bandLeft = LAYER_LEFT_PCT[Math.min(layer, LAYER_LEFT_PCT.length - 1)];
    const bandWidth = 100 - bandLeft; // remaining % for this layer
    const sliceWidth = bandWidth / peerCount;
    const leftPct = bandLeft + peerIdx * sliceWidth;

    result.set(ev.uid, {
      leftPct,
      rightPx: peerIdx < peerCount - 1 ? 0 : 3, // gap to right only at outer edge
      zIndex: 100 + layer * 10 + peerIdx,
    });
  }

  for (const ev of events.filter((e) => e.allDay)) {
    result.set(ev.uid, { leftPct: 0, rightPx: 3, zIndex: 100 });
  }

  return result;
}
