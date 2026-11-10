import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { EVENT_OBSERVED_COLUMNS } from '@/database/observedColumns';
import { useEnabledAccounts } from '@/hooks/useAccounts';
import { useSettingsStore } from '@/stores/settingsStore';
import { useCalendarStore } from '@/stores/calendarStore';
import { observeTodayEventsQuery } from '@/features/widget/core/readEvents';

import { scheduleEventAlerts } from './scheduleAlerts';

export function useEventAlerts(): void {
  const enabled = useEnabledAccounts();
  const enabledIdsKey = enabled.map((a) => a.id).join('|');
  const timedAlerts = useSettingsStore((s) => s.timedAlerts);
  const allDayAlerts = useSettingsStore((s) => s.allDayAlerts);
  const notifDisabledCalendarIds = useCalendarStore((s) => s.notifDisabledCalendarIds);

  useEffect(() => {
    const enabledIds = enabledIdsKey ? enabledIdsKey.split('|') : [];
    if (enabledIds.length === 0) return;

    void scheduleEventAlerts();

    const sub = observeTodayEventsQuery(enabledIds)
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
  }, [enabledIdsKey, timedAlerts, allDayAlerts, notifDisabledCalendarIds]);
}
