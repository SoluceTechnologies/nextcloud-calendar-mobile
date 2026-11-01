import { useCallback, useEffect, useState } from 'react';

import { useActiveAccount } from '@/hooks/useAccounts';
import { fetchTaskTypes, hasTextTaskType } from '@/services/nextcloud/taskprocessing';
import { useAccountStore } from '@/stores/accountStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Account, TaskTypeInfo } from '@/types';

const CACHE_TTL_MS = 10 * 60 * 1000;
const taskTypesCache = new Map<
  string,
  { types: Record<string, TaskTypeInfo>; appPassword: string; at: number }
>();
const inflight = new Map<string, Promise<Record<string, TaskTypeInfo>>>();

function loadTaskTypes(account: Account): Promise<Record<string, TaskTypeInfo>> {
  const cached = taskTypesCache.get(account.id);
  // Reconnects keep the account id but change credentials; server-side provider
  // changes are picked up through the TTL.
  if (
    cached &&
    cached.appPassword === account.appPassword &&
    Date.now() - cached.at < CACHE_TTL_MS
  ) {
    return Promise.resolve(cached.types);
  }
  taskTypesCache.delete(account.id);
  let p = inflight.get(account.id);
  if (!p) {
    p = fetchTaskTypes(account)
      .then((types) => {
        taskTypesCache.set(account.id, { types, appPassword: account.appPassword, at: Date.now() });
        inflight.delete(account.id);
        return types;
      })
      .catch((e) => {
        inflight.delete(account.id);
        throw e;
      });
    inflight.set(account.id, p);
  }
  return p;
}

export function useTaskTypes(): {
  taskTypes: Record<string, TaskTypeInfo> | null;
  loading: boolean;
  textTaskType: string | null;
  refresh: () => void;
} {
  const aiEnabled = useSettingsStore((s) => s.aiEnabled);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const account = useActiveAccount(activeAccountId);
  const accountId = account?.id ?? null;

  const [loaded, setLoaded] = useState<{ id: string; types: Record<string, TaskTypeInfo> } | null>(
    () => {
      if (!aiEnabled || !accountId || !account) return null;
      const cached = taskTypesCache.get(accountId);
      return cached && cached.appPassword === account.appPassword
        ? { id: accountId, types: cached.types }
        : null;
    }
  );
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!aiEnabled || !account) {
      setLoading(false);
      return;
    }
    const id = account.id;
    const cached = taskTypesCache.get(id);
    const cacheValid =
      !!cached &&
      cached.appPassword === account.appPassword &&
      Date.now() - cached.at < CACHE_TTL_MS;
    if (cacheValid) {
      if (loaded?.id !== id) setLoaded({ id, types: cached.types });
      setLoading(false);
      return;
    }
    // Credentials changed or the entry expired — drop stale types and reload.
    if (loaded?.id === id) setLoaded(null);
    let cancelled = false;
    setLoading(true);
    loadTaskTypes(account)
      .then((types) => {
        if (!cancelled) {
          setLoaded({ id, types });
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [aiEnabled, account, refreshTick, loaded?.id]);

  const refresh = useCallback(() => {
    if (accountId) {
      taskTypesCache.delete(accountId);
      inflight.delete(accountId);
      setLoaded((prev) => (prev?.id === accountId ? null : prev));
    }
    setRefreshTick((t) => t + 1);
  }, [accountId]);

  const taskTypes =
    aiEnabled && loaded && loaded.id === accountId ? loaded.types : null;
  return { taskTypes, loading, textTaskType: hasTextTaskType(taskTypes), refresh };
}
