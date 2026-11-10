import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';

import { useAccountStore } from '@/stores/accountStore';
import { EVENT_OBSERVED_COLUMNS } from '@/database/observedColumns';
import { useSettingsStore } from '@/stores/settingsStore';
import { useCalendarStore } from '@/stores/calendarStore';
import { observeTodayEventsQuery } from '@/features/widget/core/readEvents';

import { scheduleEventAlerts } from './scheduleAlerts';
import { handleAlertResponse } from './speakAlert';

// Dedupe action taps: the response listener and the cold-start read can both
// deliver the same response (e.g. tap while backgrounded → resume). Module
// scope so it survives effect re-runs.
const handledResponseKeys = new Set<string>();
const responseKey = (r: Notifications.NotificationResponse): string =>
  `${r.notification.request.identifier}:${r.actionIdentifier}`;

const onAlertResponse = (r: Notifications.NotificationResponse): void => {
  const k = responseKey(r);
  if (handledResponseKeys.has(k)) return;
  handledResponseKeys.add(k);
  handleAlertResponse(r);
};

export function useEventAlerts(): void {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const timedAlerts = useSettingsStore((s) => s.timedAlerts);
  const allDayAlerts = useSettingsStore((s) => s.allDayAlerts);
  const notifDisabledCalendarIds = useCalendarStore((s) => s.notifDisabledCalendarIds);

  // Action taps ("Écouter"/"Itinéraire") — separate from the scheduling effect
  // so a settings change can't replay the last response.
  useEffect(() => {
    const responseSub = Notifications.addNotificationResponseReceivedListener(onAlertResponse);
    void Notifications.getLastNotificationResponseAsync().then(async (response) => {
      if (!response) return;
      await Notifications.clearLastNotificationResponseAsync().catch(() => {});
      onAlertResponse(response);
    });
    return () => responseSub.remove();
  }, []);

  useEffect(() => {
    if (!activeAccountId) return;

    void scheduleEventAlerts();

    const sub = observeTodayEventsQuery(activeAccountId)
      .observeWithColumns(EVENT_OBSERVED_COLUMNS)
      .subscribe(() => {
        void scheduleEventAlerts();
      });

    const onAppState = (status: AppStateStatus) => {
      if (status === 'active') void scheduleEventAlerts();
    };
    const appSub = AppState.addEventListener('change', onAppState);

    return () => {
      sub.unsubscribe();
      appSub.remove();
    };
  }, [activeAccountId, timedAlerts, allDayAlerts, notifDisabledCalendarIds]);
}
