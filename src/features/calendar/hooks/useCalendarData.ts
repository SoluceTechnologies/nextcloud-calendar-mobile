import { useEffect, useMemo, useRef } from 'react';
import dayjs from 'dayjs';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useAppStore } from '@/store/appStore';
import { useCalendars } from '@/hooks/useCalendars';
import { loadAccounts } from '@/api/auth';
import { fetchEvents } from '@/api/caldav';
import { normalizeEvents } from '@/utils/normalizeEvent';
import { SUBSCRIBED_EVENTS_STALE } from '@/api/queryConfig';
import type { CalendarEvent } from '@/types';
import { monthRange, monthRangeAt } from '../utils/range';

export function useCalendarData(date: Date) {
  const activeAccountId = useAppStore((s) => s.activeAccountId);
  const hiddenCalendarIds = useAppStore((s) => s.hiddenCalendarIds);
  const queryClient = useQueryClient();

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: loadAccounts });
  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;

  const { data: calendars = [], isFetching: calsFetching } = useCalendars(activeAccount);

  const prevCtagsRef = useRef<string>('');
  useEffect(() => {
    const current = calendars.map((c) => c.ctag).join(',');
    if (prevCtagsRef.current && prevCtagsRef.current !== current) {
      queryClient.invalidateQueries({ queryKey: [activeAccountId, 'events'] });
    }
    prevCtagsRef.current = current;
  }, [calendars, activeAccountId, queryClient]);

  // Fetch ALL calendars regardless of visibility — hiding/showing is a client-side
  // filter applied to the merged event list below. This keeps the query key stable
  // across visibility toggles so toggling a calendar never triggers a network re-fetch.
  const regularCalendars = useMemo(
    () => calendars.filter((c) => !c.isSubscribed),
    [calendars]
  );
  const subscribedCalendars = useMemo(
    () => calendars.filter((c) => c.isSubscribed),
    [calendars]
  );
  // Stable string keys so query keys / effect deps don't churn on every render.
  const regularIds = useMemo(() => regularCalendars.map((c) => c.id), [regularCalendars]);
  const subscribedKeys = useMemo(
    () => subscribedCalendars.map((c) => c.sourceUrl ?? c.id),
    [subscribedCalendars]
  );

  const year = dayjs(date).year();
  const month = dayjs(date).month();

  const { start, end } = useMemo(() => monthRange(date), [year, month]);

  const { data: rawEvents = [], isLoading: eventsLoading, isFetching: eventsFetching } = useQuery<CalendarEvent[]>({
    queryKey: [activeAccountId, 'events', regularIds, start.toISOString(), end.toISOString()],
    queryFn: async () => {
      if (!activeAccount || regularCalendars.length === 0) return [];
      const results = await Promise.allSettled(
        regularCalendars.map((cal) => fetchEvents(activeAccount, cal, start, end))
      );
      return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    },
    enabled: activeAccount !== null && regularCalendars.length > 0,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });

  const { data: subscribedEvents = [] } = useQuery<CalendarEvent[]>({
    queryKey: [activeAccountId, 'subscribed-events', subscribedKeys],
    queryFn: async () => {
      if (!activeAccount || subscribedCalendars.length === 0) return [];
      const results = await Promise.allSettled(
        subscribedCalendars.map((cal) => fetchEvents(activeAccount, cal, start, end))
      );
      return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    },
    enabled: activeAccount !== null && subscribedCalendars.length > 0,
    staleTime: SUBSCRIBED_EVENTS_STALE,
    retry: 2,
    placeholderData: keepPreviousData,
  });

  // Apply visibility filter client-side so show/hide is instant without re-fetching.
  const allEvents = useMemo(
    () => normalizeEvents(
      [...rawEvents, ...subscribedEvents].filter((e) => !hiddenCalendarIds.includes(e.calendarId))
    ),
    [rawEvents, subscribedEvents, hiddenCalendarIds]
  );

  useEffect(() => {
    if (!activeAccount || regularCalendars.length === 0) return;
    const prefetchMonth = (monthOffset: -1 | 1) => {
      const { start: adjStart, end: adjEnd } = monthRangeAt(date, monthOffset);
      queryClient.prefetchQuery({
        queryKey: [activeAccountId, 'events', regularIds, adjStart.toISOString(), adjEnd.toISOString()],
        queryFn: () =>
          Promise.allSettled(regularCalendars.map((cal) => fetchEvents(activeAccount, cal, adjStart, adjEnd)))
            .then((results) => results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))),
        staleTime: Infinity,
      });
    };
    prefetchMonth(-1);
    prefetchMonth(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, activeAccount, regularCalendars, activeAccountId, queryClient]);

  const hadEventsRef = useRef(false);
  useEffect(() => { if (allEvents.length > 0) hadEventsRef.current = true; }, [allEvents]);
  useEffect(() => { hadEventsRef.current = false; }, [activeAccountId]);

  const showFullOverlay = !hadEventsRef.current && eventsLoading && allEvents.length === 0;
  const showSmallLoader = (eventsFetching || calsFetching) && !showFullOverlay;

  return { activeAccount, calendars, allEvents, showFullOverlay, showSmallLoader };
}
