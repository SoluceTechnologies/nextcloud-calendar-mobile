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
  if (snapshot) store().set(MONTH_KEY, JSON.stringify(snapshot));
  else store().remove(MONTH_KEY);
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
