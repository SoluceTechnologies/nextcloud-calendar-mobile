import { useCallback, useEffect, useState } from 'react';

import { useActiveAccount } from '@/hooks/useAccounts';
import { fetchTaskTypes, hasTextTaskType } from '@/services/nextcloud/taskprocessing';
import { useAccountStore } from '@/stores/accountStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Account, TaskTypeInfo } from '@/types';

const taskTypesCache = new Map<string, Record<string, TaskTypeInfo>>();
const inflight = new Map<string, Promise<Record<string, TaskTypeInfo>>>();

function loadTaskTypes(account: Account): Promise<Record<string, TaskTypeInfo>> {
  const cached = taskTypesCache.get(account.id);
  if (cached) return Promise.resolve(cached);
  let p = inflight.get(account.id);
  if (!p) {
    p = fetchTaskTypes(account)
      .then((types) => {
        taskTypesCache.set(account.id, types);
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
      if (!aiEnabled || !accountId) return null;
      const cached = taskTypesCache.get(accountId);
      return cached ? { id: accountId, types: cached } : null;
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
    if (loaded?.id === id) {
      setLoading(false);
      return;
    }
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
