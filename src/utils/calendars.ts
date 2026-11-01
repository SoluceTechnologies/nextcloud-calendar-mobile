import type { CalendarMeta } from '@/types';

export function isWritableCalendar(c: CalendarMeta): boolean {
  return !c.isReadOnly && !c.isSubscribed && c.supportsEvents !== false;
}

export const CALENDAR_GROUPS = ['personal', 'shared', 'deck', 'tasks'] as const;
export type CalendarGroup = (typeof CALENDAR_GROUPS)[number];

export function calendarGroup(c: CalendarMeta): CalendarGroup {
  if (c.isShared) return 'shared';
  if (/app-generated--deck/i.test(c.url)) return 'deck';
  if (c.supportsEvents === false) return 'tasks';
  return 'personal';
}

export function byServerOrder(a: CalendarMeta, b: CalendarMeta): number {
  return (
    CALENDAR_GROUPS.indexOf(calendarGroup(a)) - CALENDAR_GROUPS.indexOf(calendarGroup(b)) ||
    (a.order ?? 0) - (b.order ?? 0)
  );
}
