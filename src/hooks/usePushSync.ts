import { useEffect, useRef } from 'react';

import { useActiveAccount } from '@/hooks/useAccounts';
import { useAccountStore } from '@/stores/accountStore';
import { pushSyncManager } from '@/services/push/PushSyncManager';
import { syncCalendars, syncCalendarByUrl } from '@/database/sync';
import { fetchNotifications } from '@/services/nextcloud/notifications';
import { useNotificationStore, withSeenFlag } from '@/stores/notificationStore';
import { registerPushNotifications } from '@/services/push/pushRegistration';
import { listenToPushMessages, setPushAccount } from '@/services/push/pushMessageHandler';
import { useSettingsStore } from '@/stores/settingsStore';
import type { PushMessage } from '@/services/push/types';

export function usePushSync(): void {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const account = useActiveAccount(activeAccountId);
  const accountRef = useRef(account);

  useEffect(() => {
    accountRef.current = account;
  }, [account]);

  useEffect(() => {
    pushSyncManager.start();
    const removePushListener = listenToPushMessages();

    const removeListener = pushSyncManager.addListener((message: PushMessage) => {
      const current = accountRef.current;
      if (!current) return;

      switch (message.type) {
        case 'calendar_sync': {
          const body = message.payload as { calendarUrl?: string } | undefined;
          const url = body?.calendarUrl;
          if (url) {
            console.log('[usePushSync] calendar_sync for', url);
            void syncCalendarByUrl(current, url).catch((err) => {
              console.warn('[usePushSync] syncCalendarByUrl failed:', err);
            });
          } else {
            // No specific calendar URL: fall back to a full calendar refresh
            void syncCalendars(current).catch((err) => {
              console.warn('[usePushSync] syncCalendars failed:', err);
            });
          }
          break;
        }

        case 'notify_notification': {
          console.log('[usePushSync] notify_notification received');
          void fetchNotifications(current)
            .then((notifications) => {
              const store = useNotificationStore.getState();
              const incoming = notifications.map(withSeenFlag);
              store.addOrUpdateNotifications(incoming);
            })
            .catch((err) => {
              console.warn('[usePushSync] fetchNotifications failed:', err);
            });
          break;
        }

        default:
          break;
      }
    });

    return () => {
      removeListener();
      removePushListener();
      pushSyncManager.stop();
    };
  }, []);

  useEffect(() => {
    if (!account) {
      pushSyncManager.disconnect();
      setPushAccount(null, null);
      return;
    }

    const canConnect =
      account.baseUrl && account.username && account.appPassword;
    if (!canConnect) {
      pushSyncManager.disconnect();
      setPushAccount(null, null);
      return;
    }

    void pushSyncManager.connect({
      baseUrl: account.baseUrl,
      username: account.username,
      appPassword: account.appPassword,
    });

    const pushEnabled = useSettingsStore.getState().pushNotifications !== false;
    if (pushEnabled) {
      void registerPushNotifications(account)
        .then((reg) => {
          if (reg) setPushAccount(account, reg.keys.privateKey);
        })
        .catch((err) => {
          console.warn('[usePushSync] push registration failed:', err);
        });
    }
  }, [account?.id, account?.baseUrl, account?.username, account?.appPassword]);
}
