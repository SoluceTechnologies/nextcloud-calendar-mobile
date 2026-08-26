import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSharees, type ShareeResult } from '@/services/nextcloud/sharees';
import { trailingDebounce } from '@/utils/debounce';
import type { Account } from '@/types';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

interface UseContactSuggestionsOptions {
  account: Pick<Account, 'baseUrl' | 'username' | 'appPassword'> | null;
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

  const fetchForQuery = useCallback(
    async (q: string, nonce: number) => {
      if (!account) return;
      const trimmed = q.trim();
      if (trimmed.length < MIN_QUERY_LENGTH) {
        setSuggestions([]);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const results = await fetchSharees({ account, query: trimmed, limit });
        if (activeRef.current === nonce) {
          setSuggestions(results);
          setError(null);
        }
      } catch (e) {
        if (activeRef.current === nonce) {
          setSuggestions([]);
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      } finally {
        if (activeRef.current === nonce) {
          setLoading(false);
        }
      }
    },
    [account, limit],
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

    setLoading(true);
    debounce.call(trimmed, nonce);

    return () => {
      if (activeRef.current === nonce) {
        setLoading(false);
      }
    };
  }, [query, account, debounce]);

  useEffect(() => () => {
    activeRef.current += 1;
    debounce.cancel();
  }, [debounce]);

  return { suggestions, loading, error };
}
