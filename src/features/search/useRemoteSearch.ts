import { useEffect, useRef, useState } from 'react';

import { useActiveAccount } from '@/hooks/useAccounts';
import { searchCalendarEvents, type CalendarSearchEntry } from '@/services/nextcloud/search';
import { useIsOnline } from '@/services/shared/network';
import { trailingDebounce } from '@/utils/debounce';

import type { ServerRequest } from './serverSearch';

export type RemoteSearchState = { entries: CalendarSearchEntry[]; loading: boolean; failed: boolean };

const DEBOUNCE_MS = 300;

export function useRemoteSearch(accountId: string | null, request: ServerRequest | null): RemoteSearchState {
  const account = useActiveAccount(accountId);
  const online = useIsOnline();
  const accountRef = useRef(account);
  accountRef.current = account;
  const requestKey = request ? JSON.stringify(request) : '';

  const [entries, setEntries] = useState<CalendarSearchEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const generationRef = useRef(0);
  const activeRef = useRef(true);

  const [debounced] = useState(() =>
    trailingDebounce((pending: ServerRequest) => {
      const current = accountRef.current;
      if (!current) return;
      const generation = generationRef.current;
      const stillCurrent = () => activeRef.current && generation === generationRef.current;
      setLoading(true);
      setFailed(false);
      searchCalendarEvents(current, pending)
        .then((found) => {
          if (stillCurrent()) setEntries(found);
        })
        .catch(() => {
          if (stillCurrent()) setFailed(true);
        })
        .finally(() => {
          if (stillCurrent()) setLoading(false);
        });
    }, DEBOUNCE_MS),
  );

  useEffect(() => {
    activeRef.current = true;
    generationRef.current += 1;
    if (accountRef.current && requestKey && online) {
      debounced.call(JSON.parse(requestKey) as ServerRequest);
    } else {
      debounced.cancel();
      setLoading(false);
    }
    return () => {
      activeRef.current = false;
      debounced.cancel();
    };
  }, [accountId, requestKey, debounced, online]);

  return { entries, loading, failed };
}
