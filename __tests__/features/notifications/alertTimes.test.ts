import { alertTimes, allDayAlarmMinutes, ALL_DAY_HOUR } from '@/features/notifications/alerts';
import type { CalendarEvent } from '@/types';

const timedEvent: Pick<CalendarEvent, 'dtstart' | 'allDay' | 'alarms'> = {
  dtstart: new Date(2026, 0, 15, 10, 0, 0),
  allDay: false,
};

const allDayEvent: Pick<CalendarEvent, 'dtstart' | 'allDay' | 'alarms'> = {
  dtstart: new Date(2026, 0, 15, 0, 0, 0),
  allDay: true,
};

describe('alertTimes', () => {
  it('returns one date per explicit alarm, each offset from the start', () => {
    const at = alertTimes({ ...timedEvent, alarms: [60, 0, 15] }, [], []);
    expect(at.map((d) => d.getTime())).toEqual([
      new Date(2026, 0, 15, 9, 0, 0).getTime(),
      new Date(2026, 0, 15, 10, 0, 0).getTime(),
      new Date(2026, 0, 15, 9, 45, 0).getTime(),
    ]);
  });

  it('deduplicates repeated offsets', () => {
    const at = alertTimes({ ...timedEvent, alarms: [15, 15, 5] }, [], []);
    expect(at).toHaveLength(2);
  });

  it('returns no alert for an explicit empty list', () => {
    expect(alertTimes({ ...timedEvent, alarms: [] }, [60], [1])).toEqual([]);
    expect(alertTimes({ ...allDayEvent, alarms: [] }, [60], [1])).toEqual([]);
  });

  it('applies every timed default when the event has no alarms of its own', () => {
    const at = alertTimes(timedEvent, [60, 0], [1]);
    expect(at.map((d) => d.getTime())).toEqual([
      new Date(2026, 0, 15, 9, 0, 0).getTime(),
      new Date(2026, 0, 15, 10, 0, 0).getTime(),
    ]);
  });

  it('applies every all-day default at ALL_DAY_HOUR on the chosen day', () => {
    const at = alertTimes(allDayEvent, [60], [0, 1]);
    expect(at.map((d) => d.getTime())).toEqual([
      new Date(2026, 0, 15, ALL_DAY_HOUR, 0, 0).getTime(),
      new Date(2026, 0, 14, ALL_DAY_HOUR, 0, 0).getTime(),
    ]);
  });

  it('returns no alert without explicit alarms or defaults', () => {
    expect(alertTimes(timedEvent, [], [])).toEqual([]);
    expect(alertTimes(allDayEvent, [], [])).toEqual([]);
  });

  it('supports offsets after the start (negative minutes)', () => {
    const at = alertTimes({ ...timedEvent, alarms: [-30] }, [], []);
    expect(at[0].getTime()).toBe(new Date(2026, 0, 15, 10, 30, 0).getTime());
  });
});

describe('allDayAlarmMinutes', () => {
  it('converts "n days before at 9:00" to minutes before the midnight start', () => {
    expect(allDayAlarmMinutes(1)).toBe(900); // TRIGGER:-PT15H
    expect(allDayAlarmMinutes(7)).toBe(9540);
  });

  it('same-day at 9:00 is after the midnight start', () => {
    expect(allDayAlarmMinutes(0)).toBe(-540); // TRIGGER:PT9H
  });
});
