import { Appearance } from 'react-native';

import { useSettingsStore } from '@/stores/settingsStore';
import { useAccountStore } from '@/stores/accountStore';
import { useCalendarStore } from '@/stores/calendarStore';

import { readUpcomingEvents } from './readEvents';
import { buildAgendaTimeline, type BuildAgendaOptions } from './agendaSnapshot';
import type { AgendaTimelineEntry } from './types';

export const AGENDA_DAYS = 7;

/**
 * Reads upcoming events from the local WatermelonDB and builds a fresh agenda
 * timeline. This does NOT call `requestWidgetUpdate` or touch the live
 * activity — it only produces data. Used by `syncWidget` and the Android
 * `widgetTaskHandler` so that system-triggered widget updates render fresh
 * content even when the app is not open.
 *
 * Returns `null` when there is no active account or the calendar app is
 * unconfigured, so the caller can fall back to the last cached snapshot.
 */
export async function buildFreshTimeline(now: Date = new Date()): Promise<AgendaTimelineEntry[] | null> {
  if (!useAccountStore.getState().activeAccountId) return null;
  if (useAccountStore.getState().capabilities.calendarApp === 'unconfigured') return null;

  const { widgetDisabledCalendarIds } = useCalendarStore.getState();
  const events = (await readUpcomingEvents(AGENDA_DAYS, now))
    .filter((event) => !widgetDisabledCalendarIds.includes(event.calendarId));
  const locale = useSettingsStore.getState().language;
  const scheme = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';

  const options: BuildAgendaOptions = { now, locale, scheme, days: AGENDA_DAYS, maxPerSection: 10 };
  return buildAgendaTimeline(events, options);
}
