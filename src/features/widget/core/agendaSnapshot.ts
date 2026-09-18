import type { CalendarEvent } from '@/types';
import i18n from '@/utils/i18n';
import { zonedWallTimeToUtc } from '@/utils/timezone';
import { type AgendaDaySection, type AgendaEventItem, type AgendaSnapshot, type AgendaTimelineEntry, eventDeepLink } from './types';

export interface BuildAgendaOptions {
  now?: Date;
  locale?: string;
  timeZone?: string;
  maxEvents?: number;
  days?: number;
  maxPerSection?: number;
  scheme?: 'light' | 'dark';
  use24h?: boolean;
}

const DAY_MS = 86_400_000;

type FmtKind = 'dayKey' | 'weekdayShort' | 'dayNumber' | 'weekdayLong' | 'fullDate' | 'time';

const FMT_OPTS: Record<FmtKind, Intl.DateTimeFormatOptions> = {
  dayKey: { year: 'numeric', month: '2-digit', day: '2-digit' },
  weekdayShort: { weekday: 'short' },
  dayNumber: { day: 'numeric' },
  weekdayLong: { weekday: 'long' },
  fullDate: { weekday: 'long', day: 'numeric', month: 'long' },
  time: { hour: '2-digit', minute: '2-digit' },
};

const FMT_CACHE = new Map<string, Intl.DateTimeFormat>();

function fmt(kind: FmtKind, locale: string | undefined, tz: string, use24h?: boolean): Intl.DateTimeFormat {
  const key = `${kind}|${locale ?? ''}|${tz}|${use24h ?? ''}`;
  let f = FMT_CACHE.get(key);
  if (!f) {
    const opts = { ...FMT_OPTS[kind] };
    if (kind === 'time' && use24h !== undefined) opts.hour12 = !use24h;
    f = new Intl.DateTimeFormat(kind === 'dayKey' ? 'en-CA' : locale, {
      timeZone: tz,
      ...opts,
    });
    FMT_CACHE.set(key, f);
  }
  return f;
}

function zonedKey(d: Date, tz: string): string {
  return fmt('dayKey', undefined, tz).format(d);
}

function timeLabel(event: CalendarEvent, locale: string | undefined, tz: string, use24h?: boolean): string {
  if (event.allDay) return 'All day';
  const f = fmt('time', locale, tz, use24h);
  return `${f.format(event.dtstart)} – ${f.format(event.dtend)}`;
}

interface EventIndex {
  byKey: Map<string, CalendarEvent[]>;
}

function indexEvents(events: CalendarEvent[], tz: string): EventIndex {
  const dayKey = fmt('dayKey', undefined, tz);
  const byKey = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = dayKey.format(e.dtstart);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(e);
    else byKey.set(key, [e]);
  }
  for (const bucket of byKey.values()) {
    bucket.sort((a, b) => a.dtstart.getTime() - b.dtstart.getTime());
  }
  return { byKey };
}

function toItem(event: CalendarEvent, locale: string | undefined, tz: string, use24h?: boolean): AgendaEventItem {
  return {
    uid: event.uid,
    title: event.summary || '(no title)',
    startIso: event.dtstart.toISOString(),
    endIso: event.dtend.toISOString(),
    allDay: event.allDay,
    color: event.color || '#3b82f6',
    timeLabel: timeLabel(event, locale, tz, use24h),
    deepLink: eventDeepLink(event.uid),
  };
}

export function buildAgendaSnapshot(
  events: CalendarEvent[],
  {
    now = new Date(), locale, timeZone,
    maxEvents = 3, days = 0, maxPerSection = 3, scheme = 'light', use24h,
  }: BuildAgendaOptions = {},
  index?: EventIndex,
): AgendaSnapshot {
  const tz = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { byKey } = index ?? indexEvents(events, tz);

  const todays = (byKey.get(zonedKey(now, tz)) ?? [])
    .filter((e) => e.allDay || e.dtend.getTime() > now.getTime());

  const dayLabel = fmt('weekdayShort', locale, tz).format(now).toUpperCase();
  const dayNumber = fmt('dayNumber', locale, tz).format(now);

  const relativeLabel = todays.length > 0
    ? fmt('fullDate', locale, tz).format(now)
    : i18n.t('widget.emptyAgenda');

  const sections: AgendaDaySection[] = [];
  for (let i = 0; i <= days; i++) {
    const dayDate = new Date(now.getTime() + i * DAY_MS);
    const key = zonedKey(dayDate, tz);
    const isToday = i === 0;
    const dayEvents = (byKey.get(key) ?? [])
      .filter((e) => e.allDay || !isToday || e.dtend.getTime() > now.getTime());
    if (dayEvents.length === 0 && !isToday) continue;
    sections.push({
      dayKey: key,
      dayLabel: fmt('weekdayShort', locale, tz).format(dayDate).toUpperCase(),
      dayNumber: fmt('dayNumber', locale, tz).format(dayDate),
      weekdayLong: fmt('weekdayLong', locale, tz).format(dayDate),
      isToday,
      items: dayEvents.slice(0, maxPerSection).map((e) => toItem(e, locale, tz, use24h)),
    });
  }

  const nextEvent = sections.flatMap((s) => s.items)[0];

  return {
    generatedAtIso: now.toISOString(),
    timeZone: tz,
    scheme,
    dayLabel,
    dayNumber,
    relativeLabel,
    events: todays.slice(0, maxEvents).map((e) => toItem(e, locale, tz, use24h)),
    sections,
    ...(nextEvent ? { nextEvent } : {}),
  };
}

function nextZonedMidnight(after: Date, tz: string): Date {
  const [y, m, d] = zonedKey(after, tz).split('-').map(Number);
  return zonedWallTimeToUtc(y, m, d + 1, 0, 0, 0, tz);
}

export function buildAgendaTimeline(
  events: CalendarEvent[],
  options: BuildAgendaOptions = {},
  maxEntries = 24,
): AgendaTimelineEntry[] {
  const now = options.now ?? new Date();
  const tz = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const horizon = now.getTime() + ((options.days ?? 0) + 1) * DAY_MS;
  const index = indexEvents(events, tz);

  const boundaries = new Set<number>([now.getTime()]);

  for (const e of events) {
    const end = e.dtend.getTime();
    if (end > now.getTime() && end < horizon) boundaries.add(end);
  }

  let midnight = nextZonedMidnight(now, tz);
  while (midnight.getTime() < horizon) {
    boundaries.add(midnight.getTime());
    midnight = nextZonedMidnight(midnight, tz);
  }

  return [...boundaries]
    .sort((a, b) => a - b)
    .slice(0, maxEntries)
    .map((at) => ({
      atIso: new Date(at).toISOString(),
      snapshot: buildAgendaSnapshot(events, { ...options, now: new Date(at), timeZone: tz }, index),
    }));
}
