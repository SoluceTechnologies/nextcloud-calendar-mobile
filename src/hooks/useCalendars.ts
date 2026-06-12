import { useQuery } from '@tanstack/react-query';
import { fetchCalendars } from '@/api/caldav';
import { CALENDARS_STALE, CALENDARS_REFETCH_INTERVAL } from '@/api/queryConfig';
import type { Account } from '@/types';

export function useCalendars(account: Account | null) {
  return useQuery({
    queryKey: [account?.id, 'calendars'],
    queryFn: () => {
      return fetchCalendars(account!);
    },
    enabled: account !== null,
    staleTime: CALENDARS_STALE,
    refetchInterval: CALENDARS_REFETCH_INTERVAL,
  });
}
