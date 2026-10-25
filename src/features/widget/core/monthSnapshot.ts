import { Appearance } from 'react-native';

import { useSettingsStore } from '@/stores/settingsStore';
import type { CalendarEvent } from '@/types';
import { eventDayKeys } from '@/features/calendar/utils/eventDays';
import { dayKey } from '@/features/calendar/utils/grid';

import { readContactBirthdayCalendarIds, readWidgetEvents } from './readEvents';
import type { MonthWidgetDay, MonthWidgetSnapshot } from './types';

const DAY_MS = 86_400_000;

export function monthGridStart(monthStart: Date, weekStartsOn: 0 | 1): Date {
  const result = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  result.setDate(result.getDate() - ((result.getDay() - weekStartsOn + 7) % 7));
  return result;
}

function eventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const indexed = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    for (const key of eventDayKeys(event)) {
      const values = indexed.get(key) ?? [];
      values.push(event);
      indexed.set(key, values);
    }
  }
  return indexed;
}

export function formatMonthWidgetEventTitle(title: string, isContactBirthday: boolean): string {
  return isContactBirthday ? title.replace(/\s*\(\d{4}\)\s*$/, '') : title;
}

export async function buildMonthWidgetSnapshot(
  now: Date = new Date(),
  monthOffset = 0,
): Promise<MonthWidgetSnapshot | null> {
  const { language: locale, weekStartsOn } = useSettingsStore.getState();
  const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const monthStart = new Date(target.getFullYear(), target.getMonth(), 1);
  const gridStart = monthGridStart(monthStart, weekStartsOn);
  const gridEnd = new Date(gridStart.getTime() + 42 * DAY_MS);
  const [events, contactBirthdayCalendarIds] = await Promise.all([
    readWidgetEvents(gridStart, gridEnd),
    readContactBirthdayCalendarIds(),
  ]);
  const indexed = eventsByDay(events);
  const today = dayKey(now);
  const days: MonthWidgetDay[] = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    const dayEvents = indexed.get(dayKey(date)) ?? [];
    return {
      dateIso: dayKey(date),
      dayNumber: String(date.getDate()),
      dayOfWeek: date.getDay(),
      inMonth: date.getMonth() === monthStart.getMonth(),
      isToday: dayKey(date) === today,
      events: dayEvents.slice(0, 4).map((event) => ({
        uid: event.uid,
        title: formatMonthWidgetEventTitle(
          event.summary || '(no title)',
          contactBirthdayCalendarIds.has(event.calendarId),
        ),
        color: event.color || '#0082C9',
      })),
      totalEvents: dayEvents.length,
    };
  });

  return {
    monthLabel: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(monthStart),
    monthOffset,
    scheme: Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
    days,
  };
}
