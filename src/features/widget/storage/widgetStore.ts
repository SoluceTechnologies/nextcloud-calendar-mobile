import { createMMKV, type MMKV } from 'react-native-mmkv';

import type { AgendaSnapshot, AgendaTimelineEntry, LiveEventState, MonthWidgetSnapshot } from '../core/types';

export const WIDGET_MMKV_ID = 'group.com.soluce.nextcloud-calendar';

let instance: MMKV | null = null;
function store(): MMKV {
  if (!instance) instance = createMMKV({ id: WIDGET_MMKV_ID });
  return instance;
}

const AGENDA_KEY = 'widget.agenda.v1';
const LIVE_KEY = 'widget.live.v1';
const MONTH_KEY = 'widget.month.v1';
const MONTH_CACHE_KEY = 'widget.month.cache.v1';

interface MonthWidgetCache {
  baseMonth: string;
  snapshots: Record<string, MonthWidgetSnapshot>;
}

function baseMonth(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth()}`;
}

function validMonthSnapshot(snapshot: MonthWidgetSnapshot): boolean {
  return Array.isArray(snapshot.days)
    && snapshot.days.length === 42
    && typeof snapshot.monthOffset === 'number'
    && Number.isFinite(snapshot.monthOffset);
}

function readMonthCache(now: Date): MonthWidgetCache {
  const raw = store().getString(MONTH_CACHE_KEY);
  if (raw) {
    try {
      const cache = JSON.parse(raw) as MonthWidgetCache;
      if (cache.baseMonth === baseMonth(now) && cache.snapshots && typeof cache.snapshots === 'object') {
        return cache;
      }
    } catch {
      // Replace malformed or stale cache data below.
    }
  }
  return { baseMonth: baseMonth(now), snapshots: {} };
}

export function writeAgendaTimeline(entries: AgendaTimelineEntry[]): void {
  store().set(AGENDA_KEY, JSON.stringify(entries));
}

export function readAgendaSnapshot(now: Date = new Date()): AgendaSnapshot | null {
  const raw = store().getString(AGENDA_KEY);
  if (!raw) return null;
  try {
    const entries = JSON.parse(raw) as AgendaTimelineEntry[];
    if (!Array.isArray(entries) || entries.length === 0) return null;
    const t = now.getTime();
    const current = entries.filter((e) => new Date(e.atIso).getTime() <= t).pop();
    return (current ?? entries[0]).snapshot;
  } catch {
    return null;
  }
}

export function writeMonthWidgetSnapshot(snapshot: MonthWidgetSnapshot | null): void {
  if (snapshot) {
    store().set(MONTH_KEY, JSON.stringify(snapshot));
    cacheMonthWidgetSnapshot(snapshot);
  } else {
    store().remove(MONTH_KEY);
    store().remove(MONTH_CACHE_KEY);
  }
}

export function readMonthWidgetSnapshot(): MonthWidgetSnapshot | null {
  const raw = store().getString(MONTH_KEY);
  if (!raw) return null;
  try {
    const snapshot = JSON.parse(raw) as MonthWidgetSnapshot;
    if (!Array.isArray(snapshot.days) || snapshot.days.length !== 42) return null;
    if (typeof snapshot.monthOffset !== 'number' || !Number.isFinite(snapshot.monthOffset)) {
      snapshot.monthOffset = 0;
    }
    return snapshot;
  } catch {
    return null;
  }
}

export function cacheMonthWidgetSnapshot(
  snapshot: MonthWidgetSnapshot | null,
  now: Date = new Date(),
): void {
  if (!snapshot || !validMonthSnapshot(snapshot)) return;
  const cache = readMonthCache(now);
  cache.snapshots[String(snapshot.monthOffset)] = snapshot;
  store().set(MONTH_CACHE_KEY, JSON.stringify(cache));
}

export function readCachedMonthWidgetSnapshot(
  monthOffset: number,
  now: Date = new Date(),
): MonthWidgetSnapshot | null {
  const snapshot = readMonthCache(now).snapshots[String(monthOffset)];
  return snapshot && validMonthSnapshot(snapshot) ? snapshot : null;
}

export function writeLiveEvent(state: LiveEventState | null): void {
  if (state) store().set(LIVE_KEY, JSON.stringify(state));
  else store().remove(LIVE_KEY);
}

export function readLiveEvent(): LiveEventState | null {
  const raw = store().getString(LIVE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LiveEventState;
  } catch {
    return null;
  }
}
