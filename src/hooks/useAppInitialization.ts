import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
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
import { pushPinsToNative } from '@/services/shared/certPins';

SplashScreen.preventAutoHideAsync();

// Reading the accounts can fail when the OS relaunched us in the background:
// the iOS keychain is unreachable while the device is locked (SecureStore
// stores accounts as `whenUnlocked` by default), and Android's keystore and
// credential-encrypted preferences have their own transient failures. Such a
// boot must not report "ready" with an empty account list — the router reads
// that as "no account configured" and shows the setup screen, and because the
// boot only runs once per JS runtime the user keeps seeing it until the
// process is killed, even though the credentials are still on disk.
const MAX_BOOT_ATTEMPTS = 3;

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
    let booted = false;
    let running = false;
    let attempts = 0;

    const boot = async () => {
      if (booted || running) return;
      running = true;
      try {
        await migrateFromAsyncStorage();
        // Load trusted self-signed cert pins into the native layer before any
        // network call so pinned hosts connect without a prompt.
        pushPinsToNative();
        await Promise.all([
          useAccountStore.persist.rehydrate(),
          useCalendarStore.persist.rehydrate(),
          useSettingsStore.persist.rehydrate(),
        ]);
        await initializeDatabaseOnStartup();

        const accounts = await loadAccounts();
        booted = true;
        setAccounts(accounts);
        if (accounts.length > 0) {
          const activeId = await getActiveAccountId();
          const id = activeId ?? accounts[0].id;
          await persistActiveAccountId(id);
          setStoreAccountId(id);

          const activeAccount = accounts.find((a) => a.id === id) ?? accounts[0];
          void syncCalendars(activeAccount).catch((e) => {
            console.warn('[useAppInitialization] syncCalendars failed:', String(e));
          });
          // Profile refresh only ever enriches display names and timezones. It
          // re-reads secure storage, so an empty result means that read failed,
          // never that the user signed out — dropping the accounts here would
          // put the router back on the setup screen. Removal goes through
          // useDeleteAccount, which calls refreshAccounts itself.
          void refreshAccountProfiles()
            .then((refreshed) => {
              if (refreshed.length > 0) setAccounts(refreshed);
            })
            .catch((e) => {
              console.warn('[useAppInitialization] refreshAccountProfiles failed:', String(e));
            });
          void fetchCapabilities(activeAccount)
            .then((caps) => {
              if (mounted && caps) setCapabilities(caps);
            })
            .catch((e) => {
              console.warn('[useAppInitialization] fetchCapabilities failed:', String(e));
            });
        }
        if (mounted) setIsAppReady(true);
      } catch (e) {
        attempts += 1;
        console.warn(`[useAppInitialization] boot attempt ${attempts} failed:`, String(e));
        // Hold the splash and retry on the next foreground, when secure storage
        // is readable again. Give up after a few tries so a permanent failure
        // still lets the user reach the setup screen instead of a dead splash.
        if (mounted && attempts >= MAX_BOOT_ATTEMPTS) setIsAppReady(true);
      } finally {
        running = false;
      }
    };

    void boot();
    const sub = AppState.addEventListener('change', (status) => {
      if (status === 'active') void boot();
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, [setStoreAccountId, setCapabilities]);

  return { isAppReady };
}
