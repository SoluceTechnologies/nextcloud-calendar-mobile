import { useCallback, useEffect, useRef, useState } from 'react';
import type { Account, Attendee, AttendeeAvailability, SuggestedSlot } from '@/types';
import { fetchFreeBusy } from '@/services/nextcloud/freeBusy';
import { mergeBusySlots } from '@/utils/freeBusy';
import { suggestSlots } from '@/features/event/utils/suggestSlots';
import { trailingDebounce } from '@/utils/debounce';

const DEBOUNCE_MS = 500;
const SEARCH_WINDOW_DAYS = 7;

interface UseFreeBusyOptions {
  account: Account | null;
  organizer: Attendee | null;
  attendees: Attendee[];
  start: Date;
  end: Date;
  enabled?: boolean;
}

interface UseFreeBusyResult {
  loading: boolean;
  error: Error | null;
  availabilities: AttendeeAvailability[];
  suggestions: SuggestedSlot[];
  refetch: () => void;
}

export function useFreeBusy({
  account,
  organizer,
  attendees,
  start,
  end,
  enabled = true,
}: UseFreeBusyOptions): UseFreeBusyResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [availabilities, setAvailabilities] = useState<AttendeeAvailability[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedSlot[]>([]);
  const activeRef = useRef(0);
  const triggerRef = useRef(0);

  const durationMs = end.getTime() - start.getTime();

  const doFetch = useCallback(
    async (nonce: number) => {
      if (!account || !organizer || attendees.length === 0) {
        if (activeRef.current === nonce) {
          setLoading(false);
          setAvailabilities([]);
          setSuggestions([]);
          setError(null);
        }
        return;
      }

      if (activeRef.current === nonce) setLoading(true);

      // 7-day search window around the event start.
      const searchStart = new Date(start);
      searchStart.setHours(0, 0, 0, 0);
      const searchEnd = new Date(searchStart);
      searchEnd.setDate(searchEnd.getDate() + SEARCH_WINDOW_DAYS);

      try {
        const results = await fetchFreeBusy(account, organizer, attendees, searchStart, searchEnd);
        if (activeRef.current !== nonce) return;

        const merged = mergeBusySlots(results);
        const slots = suggestSlots(durationMs, searchStart, searchEnd, merged);

        setAvailabilities(results);
        setSuggestions(slots);
        setError(null);
      } catch (e) {
        if (activeRef.current !== nonce) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setAvailabilities([]);
        setSuggestions([]);
      } finally {
        if (activeRef.current === nonce) setLoading(false);
      }
    },
    [account, organizer, attendees, start, durationMs],
  );

  // Keep a ref to the latest doFetch so the debounce always calls the current version
  const doFetchRef = useRef(doFetch);
  doFetchRef.current = doFetch;

  const debounce = useRef(
    trailingDebounce((nonce: number) => {
      void doFetchRef.current(nonce);
    }, DEBOUNCE_MS),
  ).current;

  const refetch = useCallback(() => {
    triggerRef.current += 1;
    activeRef.current += 1;
    const nonce = activeRef.current;
    debounce.call(nonce);
  }, [debounce]);

  // Serialise deps that should trigger a refetch.
  const attendeeKey = attendees.map((a) => a.email).join(',');
  const startKey = start.toISOString();
  const endKey = end.toISOString();

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setAvailabilities([]);
      setSuggestions([]);
      return;
    }

    activeRef.current += 1;
    const nonce = activeRef.current;
    debounce.call(nonce);

    return () => {
      if (activeRef.current === nonce) setLoading(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, organizer, attendeeKey, startKey, endKey, enabled, debounce]);

  useEffect(() => () => {
    activeRef.current += 1;
    debounce.cancel();
  }, [debounce]);

  return { loading, error, availabilities, suggestions, refetch };
}
