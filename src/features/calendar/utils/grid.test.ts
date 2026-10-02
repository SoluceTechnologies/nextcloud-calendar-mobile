import {
  allDayEventsForDay,
  allDayRowHeight,
  buildDayIndex,
  daysPerPage,
  dayKey,
  eventPositionStyle,
  nowTopPct,
  pageDates,
  pageFocusDate,
  pageIndexForDate,
  stabilizeDayIndex,
} from '@/features/calendar/utils/grid';
import type { GridEvent } from '@/features/calendar/utils/toGridEvents';
import type { CalendarEvent } from '@/types';

const iso = (d: Date) => dayKey(d);

describe('daysPerPage', () => {
  it('maps each mode to its page span', () => {
    expect(daysPerPage('week')).toBe(7);
    expect(daysPerPage('3days')).toBe(3);
    expect(daysPerPage('day')).toBe(1);
  });
});

describe('dayKey', () => {
  it('formats as YYYY-MM-DD in local time', () => {
    expect(dayKey(new Date(2026, 7, 7, 23, 30))).toBe('2026-08-07');
  });
});

describe('pageDates', () => {
  const friday = new Date(2026, 7, 7);

  it('aligns a week page on Monday when weekStartsOn is 1', () => {
    const d = pageDates(friday, 0, 'week', 1);
    expect(d).toHaveLength(7);
    expect(iso(d[0])).toBe('2026-08-03');
    expect(iso(d[6])).toBe('2026-08-09');
  });

  it('aligns a week page on Sunday when weekStartsOn is 0', () => {
    const d = pageDates(friday, 0, 'week', 0);
    expect(iso(d[0])).toBe('2026-08-02');
    expect(iso(d[6])).toBe('2026-08-08');
  });

  it('pulls a Sunday back to the previous Monday when weekStartsOn is 1', () => {
    const sunday = new Date(2026, 7, 9);
    expect(iso(pageDates(sunday, 0, 'week', 1)[0])).toBe('2026-08-03');
  });

  it('shifts one week per index, in both directions', () => {
    expect(iso(pageDates(friday, 1, 'week', 1)[0])).toBe('2026-08-10');
    expect(iso(pageDates(friday, -1, 'week', 1)[0])).toBe('2026-07-27');
    expect(iso(pageDates(friday, -2, 'week', 1)[0])).toBe('2026-07-20');
  });

  it('slides 3days pages from the anchor without week alignment', () => {
    const d = pageDates(friday, 0, '3days', 1);
    expect(d.map(iso)).toEqual(['2026-08-07', '2026-08-08', '2026-08-09']);
    expect(pageDates(friday, 1, '3days', 1).map(iso)).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
    ]);
  });

  it('returns a single day for day mode', () => {
    expect(pageDates(friday, 0, 'day', 1).map(iso)).toEqual(['2026-08-07']);
    expect(pageDates(friday, -3, 'day', 1).map(iso)).toEqual(['2026-08-04']);
  });

  it('crosses month and year boundaries', () => {
    const dec31 = new Date(2026, 11, 31);
    expect(iso(pageDates(dec31, 1, 'day', 1)[0])).toBe('2027-01-01');
    expect(iso(pageDates(new Date(2026, 0, 1), -1, 'day', 1)[0])).toBe('2025-12-31');
  });

  it('returns dates at the start of the day', () => {
    const d = pageDates(new Date(2026, 7, 7, 17, 45), 0, 'day', 1)[0];
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });
});

describe('pageFocusDate', () => {
  const friday = new Date(2026, 7, 7, 9, 0);

  it('keeps the anchor when the page contains it', () => {
    expect(pageFocusDate(friday, 0, 'week', 1)).toEqual(friday);
  });

  it('falls back to the first date of the page otherwise', () => {
    expect(iso(pageFocusDate(friday, 1, 'week', 1))).toBe('2026-08-10');
    expect(iso(pageFocusDate(friday, -1, 'week', 1))).toBe('2026-07-27');
  });

  it('keeps the anchor on index 0 in day mode', () => {
    expect(pageFocusDate(friday, 0, 'day', 1)).toEqual(friday);
  });
});

const pct = (s: string) => Number.parseFloat(s.replace('%', ''));

describe('eventPositionStyle', () => {
  it('places a midnight-to-1am event at the top with 1/24 of the height', () => {
    const s = eventPositionStyle(new Date(2026, 7, 7, 0, 0), new Date(2026, 7, 7, 1, 0));
    expect(pct(s.top)).toBeCloseTo(0, 6);
    expect(pct(s.height)).toBeCloseTo((100 * 60) / 1440, 6);
  });

  it('places a 09:30-10:15 event by minutes from midnight', () => {
    const s = eventPositionStyle(new Date(2026, 7, 7, 9, 30), new Date(2026, 7, 7, 10, 15));
    expect(pct(s.top)).toBeCloseTo((100 * 570) / 1440, 6);
    expect(pct(s.height)).toBeCloseTo((100 * 45) / 1440, 6);
  });

  it('keeps a 5-minute event proportionally small rather than clamping it', () => {
    const s = eventPositionStyle(new Date(2026, 7, 7, 14, 0), new Date(2026, 7, 7, 14, 5));
    expect(pct(s.height)).toBeCloseTo((100 * 5) / 1440, 6);
  });

  it('lets an event ending at midnight reach the bottom', () => {
    const s = eventPositionStyle(new Date(2026, 7, 7, 23, 0), new Date(2026, 7, 8, 0, 0));
    expect(pct(s.top)).toBeCloseTo((100 * 1380) / 1440, 6);
    expect(pct(s.top) + pct(s.height)).toBeCloseTo(100, 6);
  });

  it('returns percentage strings', () => {
    const s = eventPositionStyle(new Date(2026, 7, 7, 8, 0), new Date(2026, 7, 7, 9, 0));
    expect(s.top.endsWith('%')).toBe(true);
    expect(s.height.endsWith('%')).toBe(true);
  });
});

describe('nowTopPct', () => {
  it('is 0 at midnight and 50 at noon', () => {
    expect(nowTopPct(new Date(2026, 7, 7, 0, 0))).toBeCloseTo(0, 6);
    expect(nowTopPct(new Date(2026, 7, 7, 12, 0))).toBeCloseTo(50, 6);
  });
});

function domainEvent(over: Partial<CalendarEvent>): CalendarEvent {
  return {
    uid: 'u1', href: '/u1.ics', calendarId: 'c1', accountId: 'a1',
    summary: 'Event',
    dtstart: new Date(2026, 7, 7, 9, 0), dtend: new Date(2026, 7, 7, 10, 0),
    allDay: false, color: '#0082c9', attendees: [], isRecurring: false,
    ...over,
  };
}

function gridEvent(over: Partial<CalendarEvent>): GridEvent {
  const e = domainEvent(over);
  return { title: e.summary, start: e.dtstart, end: e.dtend, color: e.color, _event: e };
}

describe('buildDayIndex', () => {
  it('returns the same index instance for the same event set', () => {
    const events = [gridEvent({})];
    const a = buildDayIndex(events);
    // Different GridEvent objects wrapping the same underlying event; the
    // content-based cache should still return the same Map.
    const b = buildDayIndex([{ ...events[0] }]);
    expect(a).toBe(b);
  });

  it('files a single-day event under its day', () => {
    const idx = buildDayIndex([gridEvent({})]);
    expect(idx.get('2026-08-07')).toHaveLength(1);
    expect(idx.size).toBe(1);
  });

  it('splits an event straddling two days and clamps each slice at midnight', () => {
    const idx = buildDayIndex([
      gridEvent({
        uid: 'span',
        dtstart: new Date(2026, 7, 7, 22, 0),
        dtend: new Date(2026, 7, 8, 3, 0),
      }),
    ]);

    const first = idx.get('2026-08-07')!;
    const second = idx.get('2026-08-08')!;
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0].start).toEqual(new Date(2026, 7, 7, 22, 0));
    expect(first[0].end).toEqual(new Date(2026, 7, 8, 0, 0));
    expect(second[0].start).toEqual(new Date(2026, 7, 8, 0, 0));
    expect(second[0].end).toEqual(new Date(2026, 7, 8, 3, 0));
  });

  it('gives a three-day event a full column on the middle day', () => {
    const idx = buildDayIndex([
      gridEvent({
        uid: 'long',
        dtstart: new Date(2026, 7, 7, 15, 0),
        dtend: new Date(2026, 7, 9, 11, 0),
      }),
    ]);

    const middle = idx.get('2026-08-08')!;
    expect(middle).toHaveLength(1);
    expect(middle[0].start).toEqual(new Date(2026, 7, 8, 0, 0));
    expect(middle[0].end).toEqual(new Date(2026, 7, 9, 0, 0));
  });

  it('does not create an empty slice for an event ending exactly at midnight', () => {
    const idx = buildDayIndex([
      gridEvent({
        uid: 'tomidnight',
        dtstart: new Date(2026, 7, 7, 22, 0),
        dtend: new Date(2026, 7, 8, 0, 0),
      }),
    ]);
    expect(idx.get('2026-08-07')).toHaveLength(1);
    expect(idx.has('2026-08-08')).toBe(false);
  });

  it('excludes all-day events, keyed off the domain allDay flag', () => {
    const idx = buildDayIndex([
      gridEvent({
        uid: 'allday',
        allDay: true,
        dtstart: new Date(2026, 7, 7, 9, 0),
        dtend: new Date(2026, 7, 7, 17, 0),
      }),
    ]);
    expect(idx.size).toBe(0);
  });

  it('preserves the original uid on every slice so overlap lookups resolve', () => {
    const idx = buildDayIndex([
      gridEvent({
        uid: 'keepme',
        dtstart: new Date(2026, 7, 7, 22, 0),
        dtend: new Date(2026, 7, 8, 3, 0),
      }),
    ]);
    expect(idx.get('2026-08-07')![0]._event.uid).toBe('keepme');
    expect(idx.get('2026-08-08')![0]._event.uid).toBe('keepme');
  });
});

const week = [
  new Date(2026, 7, 3), new Date(2026, 7, 4), new Date(2026, 7, 5), new Date(2026, 7, 6),
  new Date(2026, 7, 7), new Date(2026, 7, 8), new Date(2026, 7, 9),
];

const allDay = (uid: string, from: Date, to: Date) =>
  domainEvent({ uid, allDay: true, dtstart: from, dtend: to });

describe('allDayEventsForDay', () => {
  it('matches the day the event starts on', () => {
    const e = allDay('a', new Date(2026, 7, 5), new Date(2026, 7, 5));
    expect(allDayEventsForDay(new Date(2026, 7, 5), [e])).toHaveLength(1);
    expect(allDayEventsForDay(new Date(2026, 7, 6), [e])).toHaveLength(0);
  });

  it('matches every day a multi-day event spans, inclusive', () => {
    const e = allDay('b', new Date(2026, 7, 4), new Date(2026, 7, 6));
    expect(allDayEventsForDay(new Date(2026, 7, 4), [e])).toHaveLength(1);
    expect(allDayEventsForDay(new Date(2026, 7, 5), [e])).toHaveLength(1);
    expect(allDayEventsForDay(new Date(2026, 7, 6), [e])).toHaveLength(1);
    expect(allDayEventsForDay(new Date(2026, 7, 7), [e])).toHaveLength(0);
  });

  it('ignores the time of day', () => {
    const e = allDay('c', new Date(2026, 7, 5, 23, 59), new Date(2026, 7, 5, 23, 59));
    expect(allDayEventsForDay(new Date(2026, 7, 5, 0, 0), [e])).toHaveLength(1);
  });
});

describe('allDayRowHeight', () => {
  it('is zero with no all-day events', () => {
    expect(allDayRowHeight(week, [])).toBe(0);
  });

  it('is one row plus padding for a single event', () => {
    const e = allDay('a', new Date(2026, 7, 5), new Date(2026, 7, 5));
    expect(allDayRowHeight(week, [e])).toBe(22 + 4);
  });

  it('stays one row when three events fall on different days', () => {
    const events = [
      allDay('a', new Date(2026, 7, 4), new Date(2026, 7, 4)),
      allDay('b', new Date(2026, 7, 5), new Date(2026, 7, 5)),
      allDay('c', new Date(2026, 7, 6), new Date(2026, 7, 6)),
    ];
    expect(allDayRowHeight(week, events)).toBe(22 + 4);
  });

  it('grows to the busiest day when events stack', () => {
    const events = [
      allDay('a', new Date(2026, 7, 5), new Date(2026, 7, 5)),
      allDay('b', new Date(2026, 7, 5), new Date(2026, 7, 5)),
      allDay('c', new Date(2026, 7, 5), new Date(2026, 7, 5)),
      allDay('d', new Date(2026, 7, 6), new Date(2026, 7, 6)),
    ];
    expect(allDayRowHeight(week, events)).toBe(3 * 22 + 4);
  });

  it('is zero when every all-day event falls outside the page', () => {
    const e = allDay('a', new Date(2026, 8, 20), new Date(2026, 8, 20));
    expect(allDayRowHeight(week, [e])).toBe(0);
  });
});

describe('pageIndexForDate', () => {
  const friday = new Date(2026, 7, 7);

  it('is 0 for the anchor itself', () => {
    expect(pageIndexForDate(friday, friday, 'week', 1)).toBe(0);
    expect(pageIndexForDate(friday, friday, '3days', 1)).toBe(0);
    expect(pageIndexForDate(friday, friday, 'day', 1)).toBe(0);
  });

  it('is 0 for any other day inside the anchor week', () => {
    expect(pageIndexForDate(friday, new Date(2026, 7, 3), 'week', 1)).toBe(0);
    expect(pageIndexForDate(friday, new Date(2026, 7, 9), 'week', 1)).toBe(0);
  });

  it('counts whole weeks in both directions', () => {
    expect(pageIndexForDate(friday, new Date(2026, 7, 10), 'week', 1)).toBe(1);
    expect(pageIndexForDate(friday, new Date(2026, 7, 16), 'week', 1)).toBe(1);
    expect(pageIndexForDate(friday, new Date(2026, 6, 27), 'week', 1)).toBe(-1);
    expect(pageIndexForDate(friday, new Date(2026, 6, 20), 'week', 1)).toBe(-2);
  });

  it('respects weekStartsOn when assigning a date to a page', () => {
    const sunday = new Date(2026, 7, 9);
    expect(pageIndexForDate(friday, sunday, 'week', 1)).toBe(0);
    expect(pageIndexForDate(friday, sunday, 'week', 0)).toBe(1);
  });

  it('counts spans of three in 3days mode', () => {
    expect(pageIndexForDate(friday, new Date(2026, 7, 9), '3days', 1)).toBe(0);
    expect(pageIndexForDate(friday, new Date(2026, 7, 10), '3days', 1)).toBe(1);
    expect(pageIndexForDate(friday, new Date(2026, 7, 4), '3days', 1)).toBe(-1);
  });

  it('counts single days in day mode', () => {
    expect(pageIndexForDate(friday, new Date(2026, 7, 8), 'day', 1)).toBe(1);
    expect(pageIndexForDate(friday, new Date(2026, 7, 6), 'day', 1)).toBe(-1);
  });

  it('ignores the time of day on either side', () => {
    expect(pageIndexForDate(new Date(2026, 7, 7, 23, 59), new Date(2026, 7, 8, 0, 1), 'day', 1)).toBe(1);
  });

  it('round-trips with pageDates across month and year boundaries', () => {
    for (const target of [new Date(2026, 11, 31), new Date(2027, 0, 1), new Date(2025, 5, 15)]) {
      const index = pageIndexForDate(friday, target, 'week', 1);
      const dates = pageDates(friday, index, 'week', 1);
      expect(dates.map(dayKey)).toContain(dayKey(target));
    }
  });
});

describe('stabilizeDayIndex', () => {
  const timed = (uid: string, hour: number) =>
    gridEvent({
      uid,
      dtstart: new Date(2026, 7, 7, hour, 0),
      dtend: new Date(2026, 7, 7, hour + 1, 0),
    });

  it('reuses the previous array when a day is unchanged', () => {
    const prev = buildDayIndex([timed('a', 9)]);
    const before = prev.get('2026-08-07')!;
    const next = stabilizeDayIndex(buildDayIndex([timed('a', 9)]), prev);
    expect(next.get('2026-08-07')).toBe(before);
  });

  it('keeps the new array when an event moved', () => {
    const prev = buildDayIndex([timed('a', 9)]);
    const before = prev.get('2026-08-07')!;
    const next = stabilizeDayIndex(buildDayIndex([timed('a', 10)]), prev);
    expect(next.get('2026-08-07')).not.toBe(before);
    expect(next.get('2026-08-07')![0].start).toEqual(new Date(2026, 7, 7, 10, 0));
  });

  it('keeps the new array when a day gained an event', () => {
    const prev = buildDayIndex([timed('a', 9)]);
    const before = prev.get('2026-08-07')!;
    const next = stabilizeDayIndex(buildDayIndex([timed('a', 9), timed('b', 14)]), prev);
    expect(next.get('2026-08-07')).not.toBe(before);
    expect(next.get('2026-08-07')).toHaveLength(2);
  });

  it('reuses untouched days while replacing the one that changed', () => {
    const other = gridEvent({
      uid: 'z',
      dtstart: new Date(2026, 7, 8, 9, 0),
      dtend: new Date(2026, 7, 8, 10, 0),
    });
    const prev = buildDayIndex([timed('a', 9), other]);
    const untouched = prev.get('2026-08-08')!;
    const changed = prev.get('2026-08-07')!;

    const next = stabilizeDayIndex(buildDayIndex([timed('a', 11), other]), prev);

    expect(next.get('2026-08-08')).toBe(untouched);
    expect(next.get('2026-08-07')).not.toBe(changed);
  });

  it('detects a colour change even though start and end are identical', () => {
    const prev = buildDayIndex([timed('a', 9)]);
    const before = prev.get('2026-08-07')!;
    const recoloured = timed('a', 9);
    recoloured.color = '#ff0000';
    const next = stabilizeDayIndex(buildDayIndex([recoloured]), prev);
    expect(next.get('2026-08-07')).not.toBe(before);
  });

  it('is a no-op against an empty previous index', () => {
    const next = stabilizeDayIndex(buildDayIndex([timed('a', 9)]), new Map());
    expect(next.get('2026-08-07')).toHaveLength(1);
  });
});
