import { useEffect, useCallback } from 'react';

import { useActiveAccount } from '@/hooks/useAccounts';
import { useAccountStore } from '@/stores/accountStore';
import { useNotificationStore, withSeenFlag } from '@/stores/notificationStore';
import { fetchNotifications } from '@/services/nextcloud/notifications';

const REFRESH_INTERVAL_MS = 60_000;

export function useNotifications(): void {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const account = useActiveAccount(activeAccountId);
  const setNotifications = useNotificationStore((s) => s.setNotifications);

  const refresh = useCallback(async () => {
    if (!account) return;
    try {
      const notifications = await fetchNotifications(account);
      console.log('[useNotifications] fetched', notifications.length);
      setNotifications(notifications.map(withSeenFlag));
    } catch (err) {
      console.warn('[useNotifications] fetch failed:', err);
    }
  }, [account, setNotifications]);

  useEffect(() => {
    if (!account) return;

    void refresh();

    const interval = setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [account, refresh]);
}
