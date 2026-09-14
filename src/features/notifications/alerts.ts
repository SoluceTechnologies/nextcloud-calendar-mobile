import type { CalendarEvent } from '@/types';
import i18n from '@/utils/i18n';

// VEVENT property written instead of any VALARM when the user explicitly picks
// "no reminder" for an event. Without it, a synced event with no VALARM is
// indistinguishable from "use the defaults" (see CalendarEvent.alarms).
export const NO_ALARM_PROP = 'X-NCM-ALARM-NONE';

export type TimedAlert = 0 | 5 | 10 | 15 | 30 | 60 | 120 | 1440 | 2880 | 10080 | null;

export type AllDayAlert = 0 | 1 | 2 | 7 | null;

export const ALL_DAY_HOUR = 9;

export const TIMED_ALERTS: TimedAlert[] = [null, 0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];
export const ALL_DAY_ALERTS: AllDayAlert[] = [null, 0, 1, 2, 7];

export function timedAlertLabelKey(value: TimedAlert): string {
  if (value === null) return 'settings.alerts.none';
  if (value === 0) return 'settings.alerts.atTime';
  return `settings.alerts.before.${value}`;
}

// Label for any minute offset, including values outside TIMED_ALERTS presets.
export function alertMinutesLabel(minutes: number): string {
  if (minutes === 0) return i18n.t('settings.alerts.atTime');
  const abs = Math.abs(minutes);
  const direction = minutes > 0 ? 'before' : 'after';
  if (abs % 1440 === 0) {
    return i18n.t(`settings.alerts.custom.${direction}.days`, { value: abs / 1440 });
  }
  if (abs % 60 === 0) {
    return i18n.t(`settings.alerts.custom.${direction}.hours`, { value: abs / 60 });
  }
  return i18n.t(`settings.alerts.custom.${direction}.minutes`, { value: abs });
}

// An all-day default of `days` means "at ALL_DAY_HOUR on day D-days". Relative
// to the event's midnight start that is days*1440 - ALL_DAY_HOUR*60 minutes
// before (e.g. 1 day -> TRIGGER:-PT15H, matching Nextcloud's convention).
export function allDayAlarmMinutes(days: number): number {
  return days * 1440 - ALL_DAY_HOUR * 60;
}

export function allDayAlertLabelKey(value: AllDayAlert): string {
  if (value === null) return 'settings.alerts.none';
  if (value === 0) return 'settings.alerts.allDayOpts.sameDay';
  return `settings.alerts.allDayOpts.${value}`;
}

export function minutesToTrigger(minutes: number): string {
  if (minutes === 0) return 'PT0S';
  const sign = minutes > 0 ? '-' : '';
  const m = Math.abs(minutes);
  if (m % 1440 === 0) return `${sign}P${m / 1440}D`;
  if (m % 60 === 0) return `${sign}PT${m / 60}H`;
  return `${sign}PT${m}M`;
}

export function triggerToMinutes(trigger: string): number | null {
  const m = /^(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(trigger.trim());
  if (!m) return null;
  const [, sign, w, d, h, min, s] = m;
  const total =
    Number(w ?? 0) * 10080 +
    Number(d ?? 0) * 1440 +
    Number(h ?? 0) * 60 +
    Number(min ?? 0) +
    Math.round(Number(s ?? 0) / 60);
  if (total === 0) return 0;
  return sign === '-' ? total : -total;
}

export function alertTimes(
  event: Pick<CalendarEvent, 'dtstart' | 'allDay' | 'alarms'>,
  timed: number[],
  allDay: number[],
): Date[] {
  if (event.alarms !== undefined) {
    return [...new Set(event.alarms)].map(
      (m) => new Date(event.dtstart.getTime() - m * 60_000),
    );
  }
  if (event.allDay) {
    const d = event.dtstart;
    return [...new Set(allDay)].map(
      (days) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - days, ALL_DAY_HOUR, 0, 0),
    );
  }
  return [...new Set(timed)].map(
    (m) => new Date(event.dtstart.getTime() - m * 60_000),
  );
}
