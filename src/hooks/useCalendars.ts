import { useEffect, useRef, useState } from 'react';

import { syncCalendars } from '@/database/sync';
import { useCalendarsFromDb } from '@/database/useCalendars';
import type { Account, CalendarMeta } from '@/types';

const LIVE_POLL_MS = 30000;

export function useCalendars(account: Account | null): { data: CalendarMeta[]; isFetching: boolean } {
  const data = useCalendarsFromDb(account?.id ?? null);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    if (!account) return;
    let active = true;

    const run = (withSpinner: boolean) => {
      if (withSpinner) setIsFetching(true);
      syncCalendars(account)
        .catch((e) => {
          console.warn('[useCalendars] syncCalendars failed:', String(e));
        })
        .finally(() => {
          if (active && withSpinner) setIsFetching(false);
        });
    };

    run(true);
    const poll = setInterval(() => run(false), LIVE_POLL_MS);

    return () => {
      active = false;
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  return { data, isFetching };
}

/** Calendars of every enabled account, merged and sorted — syncs each account. */
export function useMergedCalendars(accounts: Account[]): { data: CalendarMeta[]; isFetching: boolean } {
  const ids = accounts.map((a) => a.id);
  const idsKey = ids.join('|');
  const data = useCalendarsFromDb(ids);
  const [isFetching, setIsFetching] = useState(false);
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;

  useEffect(() => {
    const list = accountsRef.current;
    if (list.length === 0) return;
    let active = true;

    const run = (withSpinner: boolean) => {
      if (withSpinner) setIsFetching(true);
      Promise.allSettled(list.map((a) => syncCalendars(a)))
        .then((results) => {
          results.forEach((r, i) => {
            if (r.status === 'rejected') {
              console.warn('[useMergedCalendars] syncCalendars failed for', list[i]?.id, r.reason);
            }
          });
        })
        .finally(() => {
          if (active && withSpinner) setIsFetching(false);
        });
    };

    run(true);
    const poll = setInterval(() => run(false), LIVE_POLL_MS);

    return () => {
      active = false;
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return { data, isFetching };
}
