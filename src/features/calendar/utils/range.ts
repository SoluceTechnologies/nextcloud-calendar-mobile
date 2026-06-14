import dayjs from 'dayjs';

export interface DateRange {
  start: Date;
  end: Date;
}

export function monthRange(date: Date): DateRange {
  const y = dayjs(date).year();
  const m = dayjs(date).month(); // 0-based
  return {
    start: new Date(y, m - 1, 1),
    end: new Date(y, m + 2, 0, 23, 59, 59, 999),
  };
}

export function monthRangeAt(date: Date, monthOffset: number): DateRange {
  return monthRange(dayjs(date).add(monthOffset, 'month').toDate());
}
