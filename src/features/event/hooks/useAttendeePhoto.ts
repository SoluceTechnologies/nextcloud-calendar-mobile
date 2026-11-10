import { useEffect, useState } from 'react';
import type { Account } from '@/types';
import { fetchSharees } from '@/services/nextcloud/sharees';

type AccountRef = Pick<Account, 'id' | 'baseUrl' | 'username' | 'appPassword'>;

// email → photoUrl resolution via the attendee autocompletion endpoint.
// Module-level cache so a detail screen / timeline with many rows issues at
// most one lookup per distinct email per account.
const cache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

function key(accountId: string, email: string): string {
  return `${accountId}:${email.trim().toLowerCase()}`;
}

/** Test helper: clears the module-level resolution cache. */
export function __clearAttendeePhotoCache(): void {
  cache.clear();
  pending.clear();
}

async function resolve(account: AccountRef, email: string): Promise<string | null> {
  const k = key(account.id, email);
  if (cache.has(k)) return cache.get(k)!;
  const inFlight = pending.get(k);
  if (inFlight) return inFlight;

  const request = (async () => {
    const needle = email.trim().toLowerCase();
    const results = await fetchSharees({ account, query: email.trim(), limit: 10 });
    const exact = results.find((r) => r.email.toLowerCase() === needle);
    return exact?.photoUrl ?? null;
  })()
    .catch(() => null)
    .then((url) => {
      cache.set(k, url);
      return url;
    })
    .finally(() => {
      pending.delete(k);
    });

  pending.set(k, request);
  return request;
}

/** Resolve an attendee email to a photoUrl (sharees autocompletion), cached. */
export function useAttendeePhoto(
  account: AccountRef | null,
  email?: string,
): { photoUrl?: string; resolving: boolean } {
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(() =>
    account && email ? (cache.get(key(account.id, email)) ?? undefined) : undefined,
  );
  const [resolving, setResolving] = useState(false);

  const accountId = account?.id;
  useEffect(() => {
    if (!account || !email) {
      setPhotoUrl(undefined);
      setResolving(false);
      return;
    }
    const k = key(account.id, email);
    if (cache.has(k)) {
      setPhotoUrl(cache.get(k) ?? undefined);
      setResolving(false);
      return;
    }
    let active = true;
    setResolving(true);
    void resolve(account, email).then((url) => {
      if (!active) return;
      setPhotoUrl(url ?? undefined);
      setResolving(false);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, email]);

  return { photoUrl, resolving };
}
