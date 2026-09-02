import * as SecureStore from 'expo-secure-store';
import { asyncStorage as AsyncStorage } from '@/storage';
import type { Account } from '@/types';
import { fetchUserInfo } from './nextcloud';
import { hostKeyFromUrl, removePinsForHost } from '@/services/shared/certPins';
import { removeCleartextConsent } from '@/services/shared/cleartextConsent';

const ACCOUNT_IDS_KEY = 'account_ids';
const ACTIVE_ACCOUNT_KEY = 'active_account_id';
const accountKey = (id: string) => `account_${id}`;

async function getAccountIds(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(ACCOUNT_IDS_KEY);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

export async function saveAccount(account: Account): Promise<void> {
  await SecureStore.setItemAsync(accountKey(account.id), JSON.stringify(account));
  const ids = await getAccountIds();
  if (!ids.includes(account.id)) {
    await AsyncStorage.setItem(ACCOUNT_IDS_KEY, JSON.stringify([...ids, account.id]));
  }
}

export async function loadAccounts(): Promise<Account[]> {
  const ids = await getAccountIds();
  const results = await Promise.all(
    ids.map(async (id) => {
      const raw = await SecureStore.getItemAsync(accountKey(id));
      if (!raw) return null;
      const account = JSON.parse(raw) as Partial<Account> & Omit<Account, 'davUserId'>;
      // Migration: ensure davUserId is present (added after initial release)
      if (!account.davUserId) {
        account.davUserId = account.username;
        await SecureStore.setItemAsync(accountKey(id), JSON.stringify(account));
      }
      return account as Account;
    })
  );
  return results.filter((a): a is Account => a !== null);
}

export async function refreshAccountProfiles(): Promise<Account[]> {
  const accounts = await loadAccounts();
  for (const account of accounts) {
    try {
      const info = await fetchUserInfo(account);
      const displayName = info.displayName || account.displayName;
      const timezone = info.timezone || account.timezone;
      const email = info.email || account.email;
      if (displayName !== account.displayName || timezone !== account.timezone || email !== account.email) {
        await saveAccount({ ...account, displayName, timezone, email });
      }
    } catch {
    }
  }
  return loadAccounts();
}

export async function deleteAccount(id: string): Promise<void> {
  const raw = await SecureStore.getItemAsync(accountKey(id));
  await SecureStore.deleteItemAsync(accountKey(id));
  const ids = await getAccountIds();
  await AsyncStorage.setItem(
    ACCOUNT_IDS_KEY,
    JSON.stringify(ids.filter((i) => i !== id))
  );
  await revokeHostTrustIfUnused(raw);
}

async function revokeHostTrustIfUnused(rawDeletedAccount: string | null): Promise<void> {
  if (!rawDeletedAccount) return;
  let host: string;
  try {
    host = hostKeyFromUrl((JSON.parse(rawDeletedAccount) as Account).baseUrl);
  } catch {
    return;
  }
  let remaining: Account[];
  try {
    remaining = await loadAccounts();
  } catch {
    return;
  }
  const stillUsed = remaining.some((a) => {
    try {
      return hostKeyFromUrl(a.baseUrl) === host;
    } catch {
      return false;
    }
  });
  if (stillUsed) return;
  removePinsForHost(host);
  removeCleartextConsent(host);
}

export async function getActiveAccountId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_ACCOUNT_KEY);
}

export async function setActiveAccountId(id: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_ACCOUNT_KEY, id);
}

export async function clearActiveAccountId(): Promise<void> {
  await AsyncStorage.removeItem(ACTIVE_ACCOUNT_KEY);
}
