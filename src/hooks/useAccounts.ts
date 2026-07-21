import { useSyncExternalStore } from 'react';

import { loadAccounts } from '@/services/nextcloud/auth';
import type { Account } from '@/types';

let accounts: Account[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

export function setAccounts(list: Account[]): void {
  accounts = list;
  emit();
}

export async function refreshAccounts(): Promise<Account[]> {
  accounts = await loadAccounts();
  emit();
  return accounts;
}

export function getAccounts(): Account[] {
  return accounts;
}

export function useAccounts(): Account[] {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => accounts,
    () => accounts,
  );
}

export function useActiveAccount(activeAccountId: string | null): Account | null {
  const list = useAccounts();
  return list.find((a) => a.id === activeAccountId) ?? null;
}
