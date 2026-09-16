import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import type { TFunction } from 'i18next';

import type { RecurrenceRule } from '@/types';

dayjs.extend(isoWeek);

export const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const POSITIONS = [1, 2, 3, 4, 5, -1] as const;
export type Position = (typeof POSITIONS)[number];

const BYDAY_RE = /^(?:([+-]?\d{1,2}))?(SU|MO|TU|WE|TH|FR|SA)$/;

export function weekdayFromDate(date: Date): Weekday {
  return WEEKDAYS[date.getDay()];
}

export function positionInMonth(date: Date): Position {
  const dayOfMonth = dayjs(date).date();
  const pos = Math.ceil(dayOfMonth / 7);
  return Math.min(pos, 5) as Position;
}

export function isoWeekNumber(date: Date): number {
  return dayjs(date).isoWeek();
}

export function monthFromDate(date: Date): number {
  return dayjs(date).month() + 1;
}

export function parseByDay(value: string): { position?: Position; weekday: Weekday } | undefined {
  const m = BYDAY_RE.exec(value);
  if (!m) return undefined;
  const positionStr = m[1];
  const weekday = m[2] as Weekday;
  const position = positionStr ? (Number(positionStr) as Position) : undefined;
  return { position, weekday };
}

export function formatByDay(position: Position | undefined, weekday: Weekday): string {
  if (position === undefined) return weekday;
  return `${position}${weekday}`;
}

export function hasPositionInByDay(value: RecurrenceRule | undefined): boolean {
  return value?.byDay?.some((d) => parseByDay(d)?.position !== undefined) ?? false;
}

export type MonthlyMode = 'date' | 'weekdayPosition';
export type YearlyMode = 'date' | 'monthPosition' | 'weekNumber';

export function monthlyMode(value: RecurrenceRule | undefined): MonthlyMode {
  if (value?.freq !== 'MONTHLY') return 'date';
  return hasPositionInByDay(value) ? 'weekdayPosition' : 'date';
}

export function yearlyMode(value: RecurrenceRule | undefined): YearlyMode {
  if (value?.freq !== 'YEARLY') return 'date';
  if (value.byWeekNo?.length) return 'weekNumber';
  if (value.byMonth?.length) return 'monthPosition';
  return 'date';
}

export function defaultWeekdayPositionByDay(date: Date): string {
  return formatByDay(positionInMonth(date), weekdayFromDate(date));
}

export function defaultYearlyMonthPositionRule(
  date: Date,
): Pick<RecurrenceRule, 'byMonth' | 'byDay'> {
  return {
    byMonth: [monthFromDate(date)],
    byDay: [defaultWeekdayPositionByDay(date)],
  };
}

export function defaultYearlyWeekNumberRule(
  date: Date,
): Pick<RecurrenceRule, 'byWeekNo' | 'byDay'> {
  return {
    byWeekNo: [isoWeekNumber(date)],
    byDay: [weekdayFromDate(date)],
  };
}

export function monthName(month: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2000, month - 1, 1));
}

const SUNDAY_2023_09_10 = new Date(2023, 8, 10);

function weekdayDate(weekday: Weekday): Date {
  const index = WEEKDAYS.indexOf(weekday);
  return new Date(SUNDAY_2023_09_10.getTime() + index * 24 * 60 * 60 * 1000);
}

function weekdayLabel(weekday: Weekday, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(weekdayDate(weekday));
}

function positionLabel(position: Position, t: TFunction): string {
  if (position === -1) return t('event.positionLast');
  const keys: Record<number, string> = {
    1: 'event.positionFirst',
    2: 'event.positionSecond',
    3: 'event.positionThird',
    4: 'event.positionFourth',
    5: 'event.positionFifth',
  };
  return t(keys[position] ?? 'event.positionFirst');
}

function formatInterval(base: string, interval?: number): string {
  if (!interval || interval <= 1) return base;
  return `${base} (×${interval})`;
}

export function formatRecurrenceRule(
  rule: RecurrenceRule,
  dtstart: Date,
  t: TFunction,
  locale: string,
): string | null {
  const interval = rule.interval;

  switch (rule.freq) {
    case 'DAILY':
      return formatInterval(t('event.freqDaily'), interval);

    case 'WEEKLY': {
      const labels = rule.byDay?.length
        ? rule.byDay.map((d) => weekdayLabel(d as Weekday, locale))
        : [weekdayLabel(weekdayFromDate(dtstart), locale)];
      return `${formatInterval(t('event.freqWeekly'), interval)} · ${labels.join(', ')}`;
    }

    case 'MONTHLY': {
      if (rule.byDay?.length) {
        const parsed = parseByDay(rule.byDay[0]);
        if (!parsed) return null;
        const pos = parsed.position ?? 1;
        const wd = weekdayLabel(parsed.weekday, locale);
        return `${formatInterval(t('event.freqMonthly'), interval)} · ${positionLabel(pos, t)} ${wd}`;
      }
      const day = new Intl.DateTimeFormat(locale, { day: 'numeric' }).format(dtstart);
      return `${formatInterval(t('event.freqMonthly'), interval)} · ${day}`;
    }

    case 'YEARLY': {
      if (rule.byMonth?.length && rule.byDay?.length) {
        const month = monthName(rule.byMonth[0], locale);
        const parsed = parseByDay(rule.byDay[0]);
        if (!parsed) return null;
        const pos = parsed.position ?? 1;
        const wd = weekdayLabel(parsed.weekday, locale);
        return `${formatInterval(t('event.freqYearly'), interval)} · ${positionLabel(pos, t)} ${wd} · ${month}`;
      }
      if (rule.byWeekNo?.length && rule.byDay?.length) {
        const parsed = parseByDay(rule.byDay[0]);
        if (!parsed) return null;
        const wd = weekdayLabel(parsed.weekday, locale);
        const week = rule.byWeekNo[0];
        return `${formatInterval(t('event.freqYearly'), interval)} · ${t('event.week')} ${week} · ${wd}`;
      }
      const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(dtstart);
      return `${formatInterval(t('event.freqYearly'), interval)} · ${date}`;
    }

    default:
      return null;
  }
}
