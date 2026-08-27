import { useCallback, useEffect, useState } from 'react';

import type { Account, CalendarInvitation } from '@/types';
import { fetchInvitations } from '@/services/nextcloud/invitations';

const POLL_MS = 60_000;

export function useInvitations(account: Account | null) {
  const [data, setData] = useState<CalendarInvitation[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!account) return;
    setIsFetching(true);
    setError(null);
    try {
      const invitations = await fetchInvitations(account);
      setData(invitations);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      console.warn('[useInvitations] fetch failed:', String(e));
    } finally {
      setIsFetching(false);
    }
  }, [account]);

  useEffect(() => {
    if (!account) return;
    refresh();
    const poll = setInterval(() => refresh(), POLL_MS);
    return () => clearInterval(poll);
  }, [account, refresh]);

  return { data, isFetching, error, refresh };
}
