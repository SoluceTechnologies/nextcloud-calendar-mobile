import { storage } from '@/storage';
import { fetchAllContacts } from './sharees';
import type { Account } from '@/types';
import type { ShareeResult } from './sharees';

const cacheKey = (accountId: string) => `contacts:${accountId}`;
const cacheAtKey = (accountId: string) => `contacts:${accountId}:at`;

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

let pendingAccountId: string | null = null;
let pendingPromise: Promise<ShareeResult[]> | null = null;

export function getCachedContacts(accountId: string): ShareeResult[] | null {
  const raw = storage.getString(cacheKey(accountId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ShareeResult[];
  } catch {
    return null;
  }
}

export function setCachedContacts(accountId: string, contacts: ShareeResult[]): void {
  storage.set(cacheKey(accountId), JSON.stringify(contacts));
  storage.set(cacheAtKey(accountId), Date.now().toString());
}

export function clearCachedContacts(accountId: string): void {
  storage.remove(cacheKey(accountId));
  storage.remove(cacheAtKey(accountId));
}

export function isCacheStale(accountId: string, ttlMs = DEFAULT_TTL_MS): boolean {
  const raw = storage.getString(cacheAtKey(accountId));
  if (!raw) return true;
  const at = Number(raw);
  return Number.isNaN(at) || Date.now() - at > ttlMs;
}

export function filterContacts(
  contacts: ShareeResult[],
  query: string,
  limit = 25,
): ShareeResult[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  const parts = trimmed.split(/\s+/);

  const matches = contacts.filter((contact) => {
    const haystack = `${contact.displayName.toLowerCase()} ${contact.email.toLowerCase()}`;
    return parts.every((part) => haystack.includes(part));
  });

  return limit > 0 ? matches.slice(0, limit) : matches;
}

export async function prefetchContacts(
  account: Pick<Account, 'id' | 'baseUrl' | 'username' | 'appPassword'>,
): Promise<ShareeResult[]> {
  if (pendingPromise && pendingAccountId === account.id) {
    return pendingPromise;
  }

  pendingAccountId = account.id;
  pendingPromise = fetchAllContacts({
    account: {
      baseUrl: account.baseUrl,
      username: account.username,
      appPassword: account.appPassword,
    },
  })
    .then((contacts) => {
      setCachedContacts(account.id, contacts);
      return contacts;
    })
    .finally(() => {
      if (pendingAccountId === account.id) {
        pendingPromise = null;
        pendingAccountId = null;
      }
    });

  return pendingPromise;
}
