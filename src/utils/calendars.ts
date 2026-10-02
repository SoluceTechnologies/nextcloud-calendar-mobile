import type { CalendarMeta } from '@/types';

export function isWritableCalendar(c: CalendarMeta): boolean {
  return !c.isReadOnly && !c.isSubscribed && c.supportsEvents !== false;
}
