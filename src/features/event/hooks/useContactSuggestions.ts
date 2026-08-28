import { useCallback, useEffect, useRef, useState } from 'react';
import type { ShareeResult } from '@/services/nextcloud/sharees';
import {
  filterContacts,
  getCachedContacts,
  isCacheStale,
  prefetchContacts,
} from '@/services/nextcloud/contactCache';
import { fetchSharees } from '@/services/nextcloud/sharees';
import { trailingDebounce } from '@/utils/debounce';
import type { Account } from '@/types';

const DEBOUNCE_MS = 150;
const MIN_QUERY_LENGTH = 2;

type AccountRef = Pick<Account, 'id' | 'baseUrl' | 'username' | 'appPassword'>;

interface UseContactSuggestionsOptions {
  account: AccountRef | null;
  query: string;
  limit?: number;
}

interface UseContactSuggestionsResult {
  suggestions: ShareeResult[];
  loading: boolean;
  error: Error | null;
}

export function useContactSuggestions({
  account,
  query,
  limit,
}: UseContactSuggestionsOptions): UseContactSuggestionsResult {
  const [suggestions, setSuggestions] = useState<ShareeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const activeRef = useRef(0);

  const setStable = useCallback(
    (nonce: number, next: Partial<UseContactSuggestionsResult>) => {
      if (activeRef.current !== nonce) return;
      if (next.suggestions !== undefined) setSuggestions(next.suggestions);
      if (next.loading !== undefined) setLoading(next.loading);
      if (next.error !== undefined) setError(next.error);
    },
    [],
  );

  const fetchForQuery = useCallback(
    async (q: string, nonce: number) => {
      if (!account) return;
      const trimmed = q.trim();
      if (trimmed.length < MIN_QUERY_LENGTH) {
        setStable(nonce, { suggestions: [], loading: false, error: null });
        return;
      }

      const cached = getCachedContacts(account.id);

      try {
        let contacts: ShareeResult[];
        if (cached && isCacheStale(account.id)) {
          contacts = await prefetchContacts(account);
        } else if (!cached) {
          // First call while the background cache is not ready: query the
          // server for the current input and prime the cache in the background
          // so the next search is instantaneous.
          const [serverResults] = await Promise.all([
            fetchSharees({ account, query: trimmed, limit }),
            prefetchContacts(account).catch(() => [] as ShareeResult[]),
          ]);
          contacts = serverResults;
        } else {
          contacts = cached;
        }

        if (activeRef.current === nonce) {
          setStable(nonce, {
            suggestions: filterContacts(contacts, trimmed, limit),
            loading: false,
            error: null,
          });
        }
      } catch (e) {
        if (activeRef.current === nonce) {
          const maybeCached = getCachedContacts(account.id);
          setStable(nonce, {
            suggestions: maybeCached
              ? filterContacts(maybeCached, trimmed, limit)
              : [],
            loading: false,
            error: e instanceof Error ? e : new Error(String(e)),
          });
        }
      }
    },
    [account, limit, setStable],
  );

  const debounce = useRef(
    trailingDebounce((q: string, nonce: number) => {
      void fetchForQuery(q, nonce);
    }, DEBOUNCE_MS),
  ).current;

  useEffect(() => {
    if (!account) {
      setSuggestions([]);
      setLoading(false);
      setError(null);
      return;
    }

    activeRef.current += 1;
    const nonce = activeRef.current;
    const trimmed = query.trim();

    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setLoading(false);
      setError(null);
      return;
    }

    // Show cached matches immediately for a snappy UI, then refresh in the
    // background if the cache is stale or missing.
    const cached = getCachedContacts(account.id);
    if (cached) {
      setSuggestions(filterContacts(cached, trimmed, limit));
      if (!isCacheStale(account.id)) {
        setLoading(false);
        setError(null);
        return;
      }
    }

    setLoading(true);
    setError(null);
    debounce.call(trimmed, nonce);

    return () => {
      if (activeRef.current === nonce) {
        setLoading(false);
      }
    };
  }, [query, account, limit, debounce]);

  useEffect(() => () => {
    activeRef.current += 1;
    debounce.cancel();
  }, [debounce]);

  return { suggestions, loading, error };
}
