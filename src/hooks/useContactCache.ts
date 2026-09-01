import { useEffect } from 'react';
import { useAccounts } from '@/hooks/useAccounts';
import { useAccountStore } from '@/stores/accountStore';
import { prefetchContacts } from '@/services/nextcloud/contactCache';

export function useContactCache(): void {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const accounts = useAccounts();
  const activeAccount = accounts.find((a) => a.id === activeAccountId);

  useEffect(() => {
    if (!activeAccount) return;
    void prefetchContacts(activeAccount).catch((e) => {
      console.warn('[useContactCache] prefetch failed:', String(e));
    });
  }, [activeAccount]);
}
