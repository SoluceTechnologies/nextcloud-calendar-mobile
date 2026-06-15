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


export function createQueryClient(): QueryClient {
  let client: QueryClient;

  const mutationCache = new MutationCache({
    onError: (error, _variables, context, mutation) => {
      const meta = eventMeta(mutation);
      if (!meta) return;
      const ctx = context as EventMutationContext | undefined;
      if (ctx?.previous) rollbackEvents(client, ctx.previous);
      Alert.alert(meta.errorTitle, describeMutationError(error));
    },

    onSuccess: (data, _variables, context, mutation) => {
      const meta = eventMeta(mutation);
      if (!meta) return;
      const ctx = context as EventMutationContext | undefined;
      if (meta.type === 'create' && ctx?.tempUid && data) {
        reconcileCreatedEvent(client, meta.accountId, ctx.tempUid, data as CalendarEvent);
      }
    },

    onSettled: (_data, _error, _variables, context, mutation) => {
      const meta = eventMeta(mutation);
      if (!meta) return;
      const ctx = context as EventMutationContext | undefined;
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
