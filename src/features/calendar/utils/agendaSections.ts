import dayjs from 'dayjs';
import type { CalendarEvent } from '@/types';

export interface AgendaSection {
  key: string;
  date: Date;
  data: CalendarEvent[];
}

export function buildAgendaSections(
  events: CalendarEvent[],
  startDay: Date,
  endDay: Date,
): AgendaSection[] {
  const start = dayjs(startDay).startOf('day');
  const end = dayjs(endDay).endOf('day');

  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const eEnd = dayjs(e.dtend);
    let cur = dayjs(e.dtstart).startOf('day');
    if (cur.isBefore(start)) cur = start.clone();
    while (cur.isBefore(eEnd) || cur.isSame(eEnd, 'day')) {
      if (cur.isAfter(end)) break;
      const key = cur.format('YYYY-MM-DD');
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(e);
      cur = cur.add(1, 'day');
    }
  }

  const result: AgendaSection[] = [];
  let cur = start.clone();
  while (cur.isBefore(end)) {
    const key = cur.format('YYYY-MM-DD');
    result.push({
      key,
      date: cur.toDate(),
      data: (byDay.get(key) ?? []).sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return a.dtstart.getTime() - b.dtstart.getTime();
      }),
    });
    cur = cur.add(1, 'day');
  }
  return result;
}
