import { Appearance } from 'react-native';

import { useSettingsStore } from '@/stores/settingsStore';
import { resolveUse24h } from '@/utils/timeFormat';
import { useAccountStore } from '@/stores/accountStore';
import { useCalendarStore } from '@/stores/calendarStore';

import { readUpcomingEvents } from './readEvents';
import { buildAgendaTimeline, type BuildAgendaOptions } from './agendaSnapshot';
import type { AgendaTimelineEntry } from './types';

export const AGENDA_DAYS = 7;

export async function buildFreshTimeline(now: Date = new Date()): Promise<AgendaTimelineEntry[] | null> {
  if (!useAccountStore.getState().activeAccountId) return null;
  if (useAccountStore.getState().capabilities.calendarApp === 'unconfigured') return null;

  const { widgetDisabledCalendarIds } = useCalendarStore.getState();
  const events = (await readUpcomingEvents(AGENDA_DAYS, now))
    .filter((event) => !widgetDisabledCalendarIds.includes(event.calendarId));
  const { language: locale, timeFormat } = useSettingsStore.getState();
  const use24h = resolveUse24h(timeFormat, locale);
  const scheme = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';

  const options: BuildAgendaOptions = { now, locale, scheme, use24h, days: AGENDA_DAYS, maxPerSection: 10 };
  return buildAgendaTimeline(events, options);
}
