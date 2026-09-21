import { Appearance } from 'react-native';

import { useSettingsStore } from '@/stores/settingsStore';
import type { CalendarEvent } from '@/types';

import { readWidgetEvents } from './readEvents';
import type { MonthWidgetDay, MonthWidgetSnapshot } from './types';

const DAY_MS = 86_400_000;

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function mondayOnOrBefore(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function eventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const indexed = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = dayKey(event.dtstart);
    const values = indexed.get(key) ?? [];
    values.push(event);
    indexed.set(key, values);
  }
  return indexed;
}

export async function buildMonthWidgetSnapshot(now: Date = new Date()): Promise<MonthWidgetSnapshot | null> {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const gridStart = mondayOnOrBefore(monthStart);
  const gridEnd = new Date(gridStart.getTime() + 42 * DAY_MS);
  const events = await readWidgetEvents(gridStart, gridEnd);
  const indexed = eventsByDay(events);
  const locale = useSettingsStore.getState().language;
  const today = dayKey(now);
  const days: MonthWidgetDay[] = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart.getTime() + index * DAY_MS);
    return {
      dateIso: dayKey(date),
      dayNumber: String(date.getDate()),
      inMonth: date.getMonth() === monthStart.getMonth(),
      isToday: dayKey(date) === today,
      events: (indexed.get(dayKey(date)) ?? []).slice(0, 2).map((event) => ({
        uid: event.uid,
        title: event.summary || '(no title)',
        color: event.color || '#3b82f6',
      })),
    };
  });

  return {
    monthLabel: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(monthStart),
    scheme: Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
    days,
  };
}
