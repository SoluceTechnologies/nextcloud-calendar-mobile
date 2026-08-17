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
        const contentType = res.headers.get('content-type') || 'image/jpeg';
        const base64 = await res.base64();
        const uri = `data:${contentType};base64,${base64}`;
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
