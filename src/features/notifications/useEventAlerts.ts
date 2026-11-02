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

export function useEventAlerts(): void {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const timedAlerts = useSettingsStore((s) => s.timedAlerts);
  const allDayAlerts = useSettingsStore((s) => s.allDayAlerts);
  const notifDisabledCalendarIds = useCalendarStore((s) => s.notifDisabledCalendarIds);

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

    // "Écouter" tapped while the app is alive; cold-start taps surface via
    // getLastNotificationResponseAsync on the next launch.
    const responseSub = Notifications.addNotificationResponseReceivedListener(handleAlertResponse);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleAlertResponse(response);
    });

    return () => {
      sub.unsubscribe();
      appSub.remove();
      responseSub.remove();
    };
  }, [activeAccountId, timedAlerts, allDayAlerts, notifDisabledCalendarIds]);
}
