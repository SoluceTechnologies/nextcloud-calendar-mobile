import { useEffect, useState } from 'react';

import { storage } from '@/storage';
import { trustedFetch } from '@/services/shared/trustedFetch';
import type { Account } from '@/types';

type AccountRef = Pick<Account, 'id' | 'baseUrl' | 'username' | 'appPassword'>;

function cacheKey(accountId: string, photoUrl: string): string {
  return `avatar:contact:${accountId}:${photoUrl}`;
}

function basicAuth(account: Pick<Account, 'username' | 'appPassword'>): string {
  return 'Basic ' + btoa(`${account.username}:${account.appPassword}`);
}

export function isOwnInstanceUrl(photoUrl: string, baseUrl: string): boolean {
  const base = baseUrl.replace(/\/+$/, '');
  return photoUrl === base || photoUrl.startsWith(`${base}/`);
}

const failed = new Set<string>();
const inFlight = new Map<string, Promise<string | null>>();

function loadPhoto(account: AccountRef, photoUrl: string, key: string): Promise<string | null> {
  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const res = await trustedFetch(photoUrl, { headers: { Authorization: basicAuth(account) } });
    if (!res.ok) {
      console.warn('[useContactAvatar] non-ok response', res.status, photoUrl);
      return null;
    }
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const uri = `data:${contentType};base64,${await res.base64()}`;
    storage.set(key, uri);
    return uri;
  })()
    .catch((e) => {
      console.warn('[useContactAvatar] failed to load photo', photoUrl, e);
      return null;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}

export function useContactAvatar(
  account: AccountRef | null,
  photoUrl?: string,
): { data: string | null | undefined } {
  const accountId = account?.id;
  const key = accountId && photoUrl ? cacheKey(accountId, photoUrl) : null;
  const [data, setData] = useState<string | null | undefined>(() =>
    key ? (storage.getString(key) ?? undefined) : undefined,
  );

  useEffect(() => {
    if (!account || !photoUrl || !key) {
      setData(undefined);
      return;
    }

    const cached = storage.getString(key);
    if (cached) {
      setData(cached);
      return;
    }
    if (failed.has(key) || !isOwnInstanceUrl(photoUrl, account.baseUrl)) {
      setData(null);
      return;
    }

    let active = true;
    setData(undefined);
    void loadPhoto(account, photoUrl, key).then((uri) => {
      if (uri === null) failed.add(key);
      if (active) setData(uri);
    });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, photoUrl]);

  return { data };
}
