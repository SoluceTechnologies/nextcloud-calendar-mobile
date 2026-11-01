import { dayKey } from '@/features/calendar/utils/grid';
import { MONTH_NUMBER_AREA, layoutWeek, linesFor, monthWeeks } from '@/features/calendar/utils/monthLayout';
import type { CalendarEvent } from '@/types';

function makeEvent(uid: string, dtstart: Date, dtend: Date, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    uid, href: `/${uid}.ics`, calendarId: 'c1', accountId: 'a1',
    summary: uid, dtstart, dtend, allDay: false, color: '#0082c9',
    attendees: [], isRecurring: false, ...extra,
  };
}

const novemberSecondWeek = monthWeeks(2026, 10, 1)[1];

describe('monthWeeks', () => {
  it('fills adjacent days: November 2026, Monday start', () => {
    const weeks = monthWeeks(2026, 10, 1);
    expect(weeks).toHaveLength(6);
    expect(dayKey(weeks[0][0])).toBe('2026-10-26');
    expect(dayKey(weeks[5][6])).toBe('2026-12-06');
    weeks.flat().forEach((day, index, allDays) => {
      if (index) expect(day.getTime()).toBeGreaterThan(allDays[index - 1].getTime());
    });
  });

  it('keeps distinct consecutive days across the DST switch (week of 2026-10-25)', () => {
    const keys = monthWeeks(2026, 9, 0).flat().map(dayKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('2026-10-25');
    expect(keys).toContain('2026-10-26');
  });
});

describe('linesFor', () => {
  it('derives the number of lines from the row height', () => {
    expect(linesFor(100)).toBe(4);
    expect(linesFor(120)).toBe(5);
    expect(linesFor(10)).toBe(1);
  });

  it('leaves a 4px gap between the day-number circle and the first chip', () => {
    const circleTopMargin = 2;
    const circleSize = 20;
    expect(MONTH_NUMBER_AREA - (circleTopMargin + circleSize)).toBe(4);
  });
});

describe('layoutWeek', () => {
  const findSegment = (segments: ReturnType<typeof layoutWeek>['segments'], uid: string) =>
    segments.find((segment) => segment.event.uid === uid);

  it('puts a multi-day all-day event in one bar above timed chips', () => {
    const holiday = makeEvent('ferien', new Date(2026, 10, 3), new Date(2026, 10, 5), { allDay: true });
    const standup = makeEvent('daily', new Date(2026, 10, 3, 9), new Date(2026, 10, 3, 9, 15));
    const { segments } = layoutWeek(novemberSecondWeek, [standup, holiday], 4);
    expect(findSegment(segments, 'ferien')).toMatchObject({ startColumn: 1, endColumn: 3, lane: 0 });
    expect(findSegment(segments, 'daily')).toMatchObject({ startColumn: 1, endColumn: 1, lane: 1 });
  });

  it('clips a bar crossing the week edge and flags it', () => {
    const shift = makeEvent('shift', new Date(2026, 10, 6), new Date(2026, 10, 12), { allDay: true });
    expect(layoutWeek(novemberSecondWeek, [shift], 4).segments[0]).toMatchObject({
      startColumn: 4, endColumn: 6, continuesLeft: false, continuesRight: true,
    });
  });

  it('draws a timed event crossing midnight as a bar, one ending at midnight as a chip', () => {
    const nightShift = makeEvent('night', new Date(2026, 10, 3, 22), new Date(2026, 10, 4, 2));
    const lateMeeting = makeEvent('late', new Date(2026, 10, 3, 23), new Date(2026, 10, 4, 0));
    const { segments } = layoutWeek(novemberSecondWeek, [nightShift, lateMeeting], 4);
    expect(findSegment(segments, 'night')).toMatchObject({ startColumn: 1, endColumn: 2 });
    expect(findSegment(segments, 'late')).toMatchObject({ startColumn: 1, endColumn: 1 });
  });

  it('fills the free lane under a shorter bar with a chip', () => {
    const mondayBar = makeEvent('bar', new Date(2026, 10, 2), new Date(2026, 10, 2), { allDay: true });
    const tuesdayChip = makeEvent('chip', new Date(2026, 10, 3, 9), new Date(2026, 10, 3, 10));
    const { segments } = layoutWeek(novemberSecondWeek, [mondayBar, tuesdayChip], 4);
    expect(findSegment(segments, 'chip')!.lane).toBe(0);
  });

  it('draws 3 items and reports +3 when 6 fall on a 4-line day', () => {
    const meetings = [9, 10, 11, 12, 13, 14].map((hour) =>
      makeEvent(`meeting-${hour}`, new Date(2026, 10, 4, hour), new Date(2026, 10, 4, hour, 30)));
    const layout = layoutWeek(novemberSecondWeek, meetings, 4);
    expect(layout.segments.filter((segment) => segment.startColumn === 2)).toHaveLength(3);
    expect(layout.overflows).toEqual([{ column: 2, count: 3 }]);
  });

  it('splits a bar around a day where its lane is hidden', () => {
    const top = makeEvent('top', new Date(2026, 10, 2), new Date(2026, 10, 5), { allDay: true });
    const long = makeEvent('long', new Date(2026, 10, 3), new Date(2026, 10, 5), { allDay: true });
    const extra = makeEvent('extra', new Date(2026, 10, 4, 9), new Date(2026, 10, 4, 10));
    const layout = layoutWeek(novemberSecondWeek, [extra, long, top], 2);
    const runs = layout.segments.filter((segment) => segment.event.uid === 'long');
    expect(runs.map((run) => [run.startColumn, run.endColumn])).toEqual([[1, 1], [3, 3]]);
    expect(runs[0].continuesRight).toBe(true);
    expect(runs[1].continuesLeft).toBe(true);
    expect(layout.overflows).toEqual([{ column: 2, count: 2 }]);
  });

  it('with one line, shows a lone item and collapses two items to +2', () => {
    const mondayMeeting = makeEvent('one', new Date(2026, 10, 2, 9), new Date(2026, 10, 2, 10));
    const tuesdayMorning = makeEvent('morning', new Date(2026, 10, 3, 9), new Date(2026, 10, 3, 10));
    const tuesdayNoon = makeEvent('noon', new Date(2026, 10, 3, 11), new Date(2026, 10, 3, 12));
    const layout = layoutWeek(novemberSecondWeek, [mondayMeeting, tuesdayMorning, tuesdayNoon], 1);
    expect(layout.segments.map((segment) => segment.event.uid)).toEqual(['one']);
    expect(layout.overflows).toEqual([{ column: 1, count: 2 }]);
  });

  it('ignores events outside the week', () => {
    const later = makeEvent('later', new Date(2026, 10, 20, 9), new Date(2026, 10, 20, 10));
    expect(layoutWeek(novemberSecondWeek, [later], 4).segments).toEqual([]);
  });

  it('never draws "+N" over a visible chip when bars are staggered', () => {
    const mondayToWednesday = makeEvent('A', new Date(2026, 10, 2), new Date(2026, 10, 4), { allDay: true });
    const tuesdayToThursday = makeEvent('B', new Date(2026, 10, 3), new Date(2026, 10, 5), { allDay: true });
    const wednesdayToFriday = makeEvent('C', new Date(2026, 10, 4), new Date(2026, 10, 6), { allDay: true });
    const layout = layoutWeek(novemberSecondWeek, [mondayToWednesday, tuesdayToThursday, wednesdayToFriday], 2);
    for (const { column } of layout.overflows) {
      const coversColumnBelowFirstLine = layout.segments.some((segment) =>
        segment.lane >= 1 && segment.startColumn <= column && column <= segment.endColumn);
      expect(coversColumnBelowFirstLine).toBe(false);
    }
    expect(layout.overflows).toContainEqual({ column: 3, count: 2 });
  });
});
