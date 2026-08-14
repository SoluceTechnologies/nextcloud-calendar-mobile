import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';

import {
  loadAccounts,
  getActiveAccountId,
  setActiveAccountId as persistActiveAccountId,
  refreshAccountProfiles,
} from '@/services/nextcloud/auth';
import { useAccountStore } from '@/stores/accountStore';
import { useCalendarStore } from '@/stores/calendarStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { setAccounts } from '@/hooks/useAccounts';
import { fetchCapabilities } from '@/services/nextcloud/nextcloud';
import { setupOnlineManager } from '@/services/shared/network';
import { initializeDatabaseOnStartup } from '@/database/utils/initialization';
import { syncCalendars } from '@/database/sync';
import { migrateFromAsyncStorage } from '@/storage';

SplashScreen.preventAutoHideAsync();

export function useAppInitialization() {
  const [isAppReady, setIsAppReady] = useState(false);
  const setStoreAccountId = useAccountStore((s) => s.setActiveAccountId);
  const setCapabilities = useAccountStore((s) => s.setCapabilities);

  useEffect(() => {
    const teardownOnline = setupOnlineManager();
    return teardownOnline;
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await migrateFromAsyncStorage();
        await Promise.all([
          useAccountStore.persist.rehydrate(),
          useCalendarStore.persist.rehydrate(),
          useSettingsStore.persist.rehydrate(),
        ]);
        await initializeDatabaseOnStartup();

        const accounts = await loadAccounts();
        setAccounts(accounts);
        if (accounts.length > 0) {
          const activeId = await getActiveAccountId();
          const id = activeId ?? accounts[0].id;
          await persistActiveAccountId(id);
          setStoreAccountId(id);

          const activeAccount = accounts.find((a) => a.id === id) ?? accounts[0];
          void syncCalendars(activeAccount).catch(() => undefined);
          void refreshAccountProfiles().then(setAccounts).catch(() => {});
          void fetchCapabilities(activeAccount)
            .then((caps) => {
              if (mounted && caps) setCapabilities(caps);
            })
            .catch(() => undefined);
        }
      } finally {
        if (mounted) setIsAppReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [setStoreAccountId, setCapabilities]);

  return { isAppReady };
}
