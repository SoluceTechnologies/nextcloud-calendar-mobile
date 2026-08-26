import { Appearance } from 'react-native';

import { useSettingsStore } from '@/stores/settingsStore';

import { useAccountStore } from '@/stores/accountStore';
import { useCalendarStore } from '@/stores/calendarStore';

import { buildAgendaTimeline } from '../core/agendaSnapshot';
import { AGENDA_DAYS, buildFreshTimeline } from '../core/buildTimeline';
import { readUpcomingEvents } from '../core/readEvents';
import { selectOngoingEvent, shouldClearLiveEvent } from '../core/liveEvent';
import { readLiveEvent } from '../storage/widgetStore';
import { homeWidget } from '../surfaces/homeWidget';
import { liveActivity } from '../surfaces/liveActivity';

let running = false;
let pending = false;

async function runSync(now: Date): Promise<void> {
  try {
    if (!useAccountStore.getState().activeAccountId) return;

    if (useAccountStore.getState().capabilities.calendarApp === 'unconfigured') {
      await homeWidget.clear();
      await liveActivity.clear();
      return;
    }

    const { widgetDisabledCalendarIds, notifDisabledCalendarIds } = useCalendarStore.getState();
    const events = (await readUpcomingEvents(AGENDA_DAYS, now))
      .filter((event) => !widgetDisabledCalendarIds.includes(event.calendarId));
    const locale = useSettingsStore.getState().language;
    const scheme = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';

    if (homeWidget.isSupported()) {
      const timeline = buildAgendaTimeline(events, { now, locale, scheme, days: AGENDA_DAYS, maxPerSection: 10 });
      await homeWidget.update(timeline);
    }

    if (liveActivity.isSupported()) {
      const enabled = useSettingsStore.getState().liveActivityEnabled;
      const liveEvents = events.filter((event) => !notifDisabledCalendarIds.includes(event.calendarId));
      const ongoing = enabled ? selectOngoingEvent(liveEvents, now) : null;
      if (ongoing) await liveActivity.update(ongoing);
      else if (shouldClearLiveEvent(readLiveEvent(), liveEvents.length, now)) await liveActivity.clear();
    }
  } catch (error) {
    if (__DEV__) console.warn('[widget] sync failed', error);
  }
}

export async function syncWidget(now: Date = new Date()): Promise<void> {
  if (running) {
    pending = true;
    return;
  }
  running = true;
  try {
    let current = now;
    do {
      pending = false;
      await runSync(current);
      current = new Date();
    } while (pending);
  } finally {
    running = false;
  }
}
