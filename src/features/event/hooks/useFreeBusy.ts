import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Account, Attendee, AttendeeAvailability, BusySlot, SuggestedSlot } from '@/types';
import { fetchFreeBusy } from '@/services/nextcloud/freeBusy';
import { mergeBusySlots } from '@/utils/freeBusy';
import { attendeeColor } from '@/utils/attendees';
import { suggestSlots } from '@/features/event/utils/suggestSlots';
import { trailingDebounce } from '@/utils/debounce';

const DEBOUNCE_MS = 500;
const SEARCH_WINDOW_DAYS = 15;
const SEARCH_WINDOW_PADDING_DAYS = 7;

export type FindTimeMode = 'strict' | 'permissive';

interface UseFreeBusyOptions {
  account: Account | null;
  organizer: Attendee | null;
  attendees: Attendee[];
  start: Date;
  end: Date;
  enabled?: boolean;
  mode?: FindTimeMode;
  requiredAttendees?: string[];
}

interface UseFreeBusyResult {
  loading: boolean;
  error: Error | null;
  availabilities: AttendeeAvailability[];
  suggestions: SuggestedSlot[];
  mergedBusy: BusySlot[];
  searchStart: Date | null;
  searchEnd: Date | null;
  refetch: () => void;
}

function startOfDay(d: Date): Date {
  const result = new Date(d);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

function isWithinRange(date: Date, rangeStart: Date, rangeEnd: Date): boolean {
  const t = startOfDay(date).getTime();
  return t >= startOfDay(rangeStart).getTime() && t < startOfDay(rangeEnd).getTime();
}

export function useFreeBusy({
  account,
  organizer,
  attendees,
  start,
  end,
  enabled = true,
  mode = 'strict',
  requiredAttendees,
}: UseFreeBusyOptions): UseFreeBusyResult {
  const durationMs = end.getTime() - start.getTime();

  // Needed window for the current start date.
  const neededWindow = useMemo(() => {
    const searchStart = addDays(startOfDay(start), -SEARCH_WINDOW_PADDING_DAYS);
    const searchEnd = addDays(searchStart, SEARCH_WINDOW_DAYS);
    return { start: searchStart, end: searchEnd };
  }, [start]);

  const requiredSet = useMemo(() => {
    if (mode === 'strict' || !requiredAttendees) {
      return new Set(attendees.map((a) => a.email.toLowerCase()));
    }
    return new Set(requiredAttendees.map((e) => e.toLowerCase()));
  }, [mode, requiredAttendees, attendees]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [rawAvailabilities, setRawAvailabilities] = useState<AttendeeAvailability[]>([]);
  const [searchRange, setSearchRange] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null });
  const activeRef = useRef(0);

  // Enrich raw data with required flag and a deterministic color for each attendee.
  const availabilities = useMemo<AttendeeAvailability[]>(() => {
    return rawAvailabilities.map((a) => ({
      ...a,
      color: a.color || attendeeColor(a.email),
      required: requiredSet.has(a.email.toLowerCase()),
    }));
  }, [rawAvailabilities, requiredSet]);

  // Effective busy slots for the current mode: strict = all, permissive = required only.
  const mergedBusy = useMemo<BusySlot[]>(() => {
    const effective = mode === 'strict'
      ? availabilities
      : availabilities.filter((a) => a.required);
    return mergeBusySlots(effective);
  }, [availabilities, mode]);

  // Suggestions are computed locally from the filtered busy slots and the current event window.
  const suggestions = useMemo(() => {
    if (!searchRange.start || !searchRange.end || mergedBusy.length === 0) return [];
    return suggestSlots(durationMs, searchRange.start, searchRange.end, mergedBusy);
  }, [durationMs, searchRange, mergedBusy]);

  const doFetch = useCallback(
    async (nonce: number) => {
      if (!account || !organizer || attendees.length === 0) {
        if (activeRef.current === nonce) {
          setLoading(false);
          setRawAvailabilities([]);
          setSearchRange({ start: null, end: null });
          setError(null);
        }
        return;
      }

      if (activeRef.current === nonce) setLoading(true);

      try {
        const results = await fetchFreeBusy(account, organizer, attendees, neededWindow.start, neededWindow.end);
        if (activeRef.current !== nonce) return;

        setRawAvailabilities(results);
        setSearchRange({ start: neededWindow.start, end: neededWindow.end });
        setError(null);
      } catch (e) {
        if (activeRef.current !== nonce) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (activeRef.current === nonce) setLoading(false);
      }
    },
    [account, organizer, attendees, neededWindow],
  );

  const doFetchRef = useRef(doFetch);
  doFetchRef.current = doFetch;

  const debounce = useRef(
    trailingDebounce((nonce: number) => {
      void doFetchRef.current(nonce);
    }, DEBOUNCE_MS),
  ).current;

  const refetch = useCallback(() => {
    activeRef.current += 1;
    const nonce = activeRef.current;
    debounce.call(nonce);
  }, [debounce]);

  const attendeeKey = attendees.map((a) => a.email).join(',');

  useEffect(() => {
    if (!enabled || !account || !organizer || attendees.length === 0) {
      setLoading(false);
      return;
    }

    // Reuse existing data if the current start still falls within the already loaded window.
    if (
      searchRange.start &&
      searchRange.end &&
      isWithinRange(start, searchRange.start, searchRange.end)
    ) {
      setLoading(false);
      return;
    }

    activeRef.current += 1;
    const nonce = activeRef.current;
    debounce.call(nonce);

    return () => {
      if (activeRef.current === nonce) setLoading(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, organizer, attendeeKey, neededWindow.start, neededWindow.end, enabled, debounce]);

  useEffect(() => () => {
    activeRef.current += 1;
    debounce.cancel();
  }, [debounce]);

  return { loading, error, availabilities, suggestions, mergedBusy, searchStart: searchRange.start, searchEnd: searchRange.end, refetch };
}
