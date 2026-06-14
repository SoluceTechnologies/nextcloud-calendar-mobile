import { useQuery } from '@tanstack/react-query';
import { fetchCalendars } from '@/api/caldav';
import { CALENDARS_STALE, CALENDARS_LIVE_POLL } from '@/api/queryConfig';
import type { Account } from '@/types';

export function useCalendars(account: Account | null) {
  return useQuery({
    queryKey: [account?.id, 'calendars'],
    queryFn: () => {
      return fetchCalendars(account!);
    },
    enabled: account !== null,
    staleTime: CALENDARS_STALE,
    // Near-live: poll the cheap ctag list. Structural sharing keeps the same
    // reference when nothing changed, so this does NOT churn the events query
    // key — the heavy events refetch only fires on a real ctag diff.
    refetchInterval: CALENDARS_LIVE_POLL,
    // Pause the poll while backgrounded (needs focusManager wired to AppState
    // in app/_layout.tsx) and force a ctag check the moment we return.
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: 'always',
  });
}
