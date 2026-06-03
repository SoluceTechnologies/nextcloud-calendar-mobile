import { useQuery } from '@tanstack/react-query';
import { fetchCalendars } from '@/api/caldav';
import type { Account } from '@/types';

export function useCalendars(account: Account | null) {
  return useQuery({
    queryKey: [account?.id, 'calendars'],
    queryFn: () => {
      return fetchCalendars(account!);
    },
    enabled: account !== null,
    staleTime: 0,
    refetchInterval: 60_000,
  });
}
