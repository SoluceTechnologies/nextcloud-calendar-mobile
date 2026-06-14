import dayjs from 'dayjs';
import { Platform } from 'react-native';
import type { CalendarEvent } from '@/types';
import type { CalMode } from '../constants';

const DAY_ROW = 66;
const ALLDAY_ROW = 26;
const ALLDAY_PAD = 4;

export function headerHeightForMode(
  mode: CalMode,
  focusDate: Date,
  allDayEvents: CalendarEvent[],
  weekStartsOn: 0 | 1,
): number {
  if (allDayEvents.length === 0) return DAY_ROW;

  const focus = dayjs(focusDate);
  const span = mode === 'week' ? 7 : mode === '3days' ? 3 : 1;
  const startDow = focus.day();
  const rangeStart = mode === 'week'
    ? focus.add(weekStartsOn - startDow - (startDow < weekStartsOn ? 7 : 0), 'day')
    : focus;

  let maxPerDay = 0;
  for (let i = 0; i < span; i++) {
    const ds = rangeStart.add(i, 'day').startOf('day');
    let c = 0;
    for (const e of allDayEvents) {
      const s = dayjs(e.dtstart).startOf('day');
      const en = dayjs(e.dtend).startOf('day');
      if (!ds.isBefore(s) && !ds.isAfter(en)) c++;
    }
    if (c > maxPerDay) maxPerDay = c;
  }
  return DAY_ROW + (maxPerDay > 0 ? maxPerDay * ALLDAY_ROW + ALLDAY_PAD : 0);
}

export function calBodyHeight(calArea: number, headerHeight: number, hourRowHeight: number): number {
  return Math.max(calArea - headerHeight + hourRowHeight * 3, hourRowHeight * 3 + 1);
}

export function nowScrollOffset(hourRowHeight: number): number {
  const targetHour = Math.max(0, new Date().getHours() - 1);
  return Platform.OS === 'ios' ? targetHour * hourRowHeight : targetHour * 60;
}
