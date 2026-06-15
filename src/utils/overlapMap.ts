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

  const n = timed.length;
  let i = 0;
  while (i < n) {
    let clusterMaxEnd = timed[i].dtend.getTime();
    let j = i + 1;
    while (j < n && timed[j].dtstart.getTime() < clusterMaxEnd) {
      clusterMaxEnd = Math.max(clusterMaxEnd, timed[j].dtend.getTime());
      j++;
    }

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
