import { useEffect, useState } from 'react';

import { storage } from '@/storage';
import type { Account } from '@/types';
import { trustedFetch } from '@/services/shared/trustedFetch';

function cacheKey(id: string): string {
  return `avatar:${id}`;
}

function basicAuth(account: Pick<Account, 'username' | 'appPassword'>): string {
  return 'Basic ' + btoa(`${account.username}:${account.appPassword}`);
}

export function useAvatar(account: Account | null): { data: string | null | undefined } {
  const [data, setData] = useState<string | null | undefined>(() =>
    account ? (storage.getString(cacheKey(account.id)) ?? undefined) : undefined,
  );

  useEffect(() => {
    if (!account) {
      setData(undefined);
      return;
    }
    let active = true;
    const cached = storage.getString(cacheKey(account.id));
    if (cached) setData(cached);

    (async () => {
      try {
        const url = `${account.baseUrl}/index.php/avatar/${encodeURIComponent(account.davUserId)}/96`;
        const res = await trustedFetch(url, { headers: { Authorization: basicAuth(account) } });
        if (!res.ok) {
          console.warn('[useAvatar] non-ok response', res.status, url);
          if (active && !cached) setData(null);
          return;
        }
        const blob = await res.blob();
        const uri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            typeof reader.result === 'string'
              ? resolve(reader.result)
              : reject(new Error('unexpected FileReader result type'));
          reader.onerror = () => reject(new Error('FileReader failed'));
          reader.readAsDataURL(blob);
        });
        storage.set(cacheKey(account.id), uri);
        if (active) setData(uri);
      } catch (e) {
        console.warn('[useAvatar] failed to load avatar', account.baseUrl, e);
        if (active && !cached) setData(null);
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  return { data };
}
