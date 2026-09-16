import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAccountStore } from '@/stores/accountStore';
import { useCalendarStore } from '@/stores/calendarStore';
import { EVENT_OBSERVED_COLUMNS } from '@/database/observedColumns';

import { observeAgendaEventsQuery } from '../core/readEvents';
import { AGENDA_DAYS } from '../core/buildTimeline';
import { liveActivity } from '../surfaces/liveActivity';
import { registerWidgetBackgroundSync, unregisterWidgetBackgroundSync } from '../sync/backgroundSync';
import { syncWidget } from '../sync/syncWidget';

const REFRESH_MS = 60_000;

export function useWidgetSync(): void {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const calendarApp = useAccountStore((s) => s.capabilities.calendarApp);
  const hiddenCalendarIds = useCalendarStore((s) => s.hiddenCalendarIds);
  const notifDisabledCalendarIds = useCalendarStore((s) => s.notifDisabledCalendarIds);
  const widgetDisabledCalendarIds = useCalendarStore((s) => s.widgetDisabledCalendarIds);
  const prevAccountRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (activeAccountId) void syncWidget();
  }, [hiddenCalendarIds, notifDisabledCalendarIds, widgetDisabledCalendarIds, activeAccountId, calendarApp]);

  useEffect(() => {
    const prevAccount = prevAccountRef.current;
    prevAccountRef.current = activeAccountId;
    const accountChanged = prevAccount !== undefined && prevAccount !== activeAccountId;

    if (!activeAccountId) {
      if (accountChanged) void liveActivity.clear().catch(() => undefined);
      void unregisterWidgetBackgroundSync();
      return;
    }

    void (async () => {
      try {
        if (accountChanged) await liveActivity.clear();
        await liveActivity.requestPermission?.();
        await syncWidget();
      } catch {
      }
    })();
    void registerWidgetBackgroundSync();

    const sub = observeAgendaEventsQuery(activeAccountId, AGENDA_DAYS)
      .observeWithColumns(EVENT_OBSERVED_COLUMNS)
      .subscribe(() => {
        void syncWidget();
      });

    const tick = setInterval(() => {
      void syncWidget();
    }, REFRESH_MS);

    const onAppState = (status: AppStateStatus) => {
      if (status === 'active') void syncWidget();
    };
    const appSub = AppState.addEventListener('change', onAppState);

    return () => {
      sub.unsubscribe();
      clearInterval(tick);
      appSub.remove();
    };
  }, [activeAccountId]);
}
