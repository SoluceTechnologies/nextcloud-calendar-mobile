import { useQuery } from '@tanstack/react-query';
import { AVATAR_STALE, AVATAR_GC } from '@/api/queryConfig';
import type { Account } from '@/types';

function basicAuth(account: Pick<Account, 'username' | 'appPassword'>): string {
  return 'Basic ' + btoa(`${account.username}:${account.appPassword}`);
}

export function useAvatar(account: Account | null) {
  return useQuery<string | null>({
    queryKey: ['avatar', account?.id],
    queryFn: async (): Promise<string | null> => {
      const url = `${account!.baseUrl}/index.php/avatar/${encodeURIComponent(account!.davUserId)}/96`;
      const res = await fetch(url, {
        headers: { Authorization: basicAuth(account!) },
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            reject(new Error('unexpected FileReader result type'));
          }
        };
        reader.onerror = () => reject(new Error('FileReader failed'));
        reader.readAsDataURL(blob);
      });
    },
    enabled: !!account?.id,
    staleTime: AVATAR_STALE,
    gcTime: AVATAR_GC,
    retry: 1,
  });
}
