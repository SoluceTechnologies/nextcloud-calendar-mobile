import { getCalendars, getLocales } from 'expo-localization';
import dayjs from 'dayjs';

import type { TimeFormatPreference } from '@/stores/settingsStore';

function localePrefers24h(locale?: string): boolean {
  try {
    const hour12 = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hour12;
    if (typeof hour12 === 'boolean') return !hour12;
  } catch {
  }
  return true;
}

// 'auto' follows the OS 24-hour setting first (Android "Use 24-hour format",
// iOS Settings > General > Date & Time), then falls back to the device locale
// convention — it carries the region, unlike the app language — and finally
// to the `locale` argument when the platform cannot report either (returns
// null on some web runtimes without hourCycle support).
export function resolveUse24h(pref: TimeFormatPreference, locale?: string): boolean {
  if (pref === '24h') return true;
  if (pref === '12h') return false;
  let fallbackLocale = locale;
  try {
    const sys = getCalendars()[0]?.uses24hourClock;
    if (typeof sys === 'boolean') return sys;
    fallbackLocale = getLocales()[0]?.languageTag ?? locale;
  } catch {
  }
  return localePrefers24h(fallbackLocale);
}

export function formatTime(date: Date | dayjs.Dayjs | string | number, use24h: boolean): string {
  return dayjs(date).format(use24h ? 'HH:mm' : 'h:mm A');
}

export function formatHour(hour: number, use24h: boolean): string {
  if (use24h) return `${String(hour).padStart(2, '0')}:00`;
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}
