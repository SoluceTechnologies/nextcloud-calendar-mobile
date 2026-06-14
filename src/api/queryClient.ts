import { QueryClient, MutationCache, type Mutation } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { DEFAULT_STALE, DEFAULT_GC } from './queryConfig';
import {
  rollbackEvents,
  reconcileCreatedEvent,
  refetchEventsTargeted,
  type EventMutationContext,
  type EventMutationMeta,
} from '@/hooks/eventMutationReconcile';
import type { CalendarEvent } from '@/types';

/**
 * Turn a thrown mutation error into a short, user-facing message. Centralized
 * so create / edit / delete report failures consistently.
 */
export function describeMutationError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  if (msg.includes('403')) {
    return 'Permission denied. This calendar is read-only or shared without write access.';
  }
  if (/network|fetch|timeout|abort/i.test(msg)) {
    return 'Network error. Check your connection and try again.';
  }
  return msg || 'Something went wrong. Please try again.';
}

function eventMeta(mutation: Mutation<any, any, any, any>): EventMutationMeta | undefined {
  const meta = mutation.meta as EventMutationMeta | undefined;
  return meta?.eventMutation ? meta : undefined;
}

/**
 * Build the app's QueryClient with optimistic-mutation reconciliation wired
 * into the MutationCache (not individual hooks). This is what lets a create /
 * edit / delete navigate away instantly: the optimistic patch is applied in
 * each hook's `onMutate`, and rollback / reconcile / error reporting run here —
 * so they fire even after the originating screen has unmounted.
 *
 * Exported as a factory so tests get a fresh, fully-wired client.
 */
export function createQueryClient(): QueryClient {
  // Captured by the cache callbacks below; assigned before any mutation runs.
  let client: QueryClient;

  const mutationCache = new MutationCache({
    onError: (error, _variables, context, mutation) => {
      const meta = eventMeta(mutation);
      if (!meta) return;
      const ctx = context as EventMutationContext | undefined;
      // Undo the optimistic change, then surface a global message — the screen
      // that started this is likely already gone.
      if (ctx?.previous) rollbackEvents(client, ctx.previous);
      Alert.alert(meta.errorTitle, describeMutationError(error));
    },

    onSuccess: (data, _variables, context, mutation) => {
      const meta = eventMeta(mutation);
      if (!meta) return;
      const ctx = context as EventMutationContext | undefined;
      // Create: swap the optimistic placeholder for the real server event so
      // its uid/href are correct — without re-fetching everything.
      if (meta.type === 'create' && ctx?.tempUid && data) {
        reconcileCreatedEvent(client, meta.accountId, ctx.tempUid, data as CalendarEvent);
      }
    },

    onSettled: (_data, _error, _variables, context, mutation) => {
      const meta = eventMeta(mutation);
      if (!meta) return;
      const ctx = context as EventMutationContext | undefined;
      // Recurring events are expanded server-side; one targeted refetch brings
      // local state in line. Non-recurring mutations reconcile purely locally.
      if (ctx?.needsServerReconcile) refetchEventsTargeted(client, meta.accountId);
    },
  });

  client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE,
        gcTime: DEFAULT_GC,
        networkMode: 'offlineFirst',
        retry: 1,
      },
    },
    mutationCache,
  });

  return client;
}

/** App-wide singleton. */
export const queryClient = createQueryClient();
