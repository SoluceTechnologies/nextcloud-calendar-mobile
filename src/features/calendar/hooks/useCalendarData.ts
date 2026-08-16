import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';

import { syncEvents } from '@/database/sync';
import { useEventsForRange } from '@/database/useEvents';
import { useAccountStore } from '@/stores/accountStore';
import { useCalendarStore } from '@/stores/calendarStore';
import { useActiveAccount } from '@/hooks/useAccounts';
import { useCalendars } from '@/hooks/useCalendars';
import { normalizeEvents } from '@/utils/normalizeEvent';
import { monthRange, monthRangeAt } from '../utils/range';

export function useCalendarData(date: Date) {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const hiddenCalendarIds = useCalendarStore((s) => s.hiddenCalendarIds);
  const activeAccount = useActiveAccount(activeAccountId);

  const { data: calendars = [], isFetching: calsFetching } = useCalendars(activeAccount);

  const year = dayjs(date).year();
  const month = dayjs(date).month();
  const { start, end } = useMemo(() => monthRange(date), [year, month]);

  const dbEvents = useEventsForRange(activeAccountId ?? '', start, end);

  const [syncing, setSyncing] = useState(false);


  useEffect(() => {
    if (!activeAccount || calendars.length === 0) return;
    if (calendars.some((c) => c.accountId !== activeAccount.id)) {
      if (__DEV__) {
        console.warn('[useCalendarData] stale calendars for account, skipping sync', activeAccount.id);
      }
      return;
    }
    let active = true;
    setSyncing(true);
    (async () => {
      try {
        await syncEvents(activeAccount, calendars, start, end);
      } catch {
      } finally {
        if (active) setSyncing(false);
      }
      const prev = monthRangeAt(date, -1);
      const next = monthRangeAt(date, 1);
      void syncEvents(activeAccount, calendars, prev.start, prev.end, false).catch(() => undefined);
      void syncEvents(activeAccount, calendars, next.start, next.end, false).catch(() => undefined);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount?.id, calendars, start.getTime(), end.getTime()]);

  const allEvents = useMemo(() => {
    const nonEditableCalendarIds = new Set(
      calendars.filter((c) => c.isReadOnly || c.isSubscribed).map((c) => c.id),
    );
    return normalizeEvents(
      dbEvents.filter((e) => !hiddenCalendarIds.includes(e.calendarId)),
    ).map((e) =>
      nonEditableCalendarIds.has(e.calendarId) ? { ...e, readOnly: true } : e,
    );
  }, [dbEvents, hiddenCalendarIds, calendars]);

  const hadEventsRef = useRef(false);
  useEffect(() => {
    if (allEvents.length > 0) hadEventsRef.current = true;
  }, [allEvents]);
  useEffect(() => {
    hadEventsRef.current = false;
  }, [activeAccountId]);

  const showFullOverlay = !hadEventsRef.current && syncing && allEvents.length === 0;
  const showSmallLoader = (syncing || calsFetching) && !showFullOverlay;

  return { activeAccount, calendars, allEvents, showFullOverlay, showSmallLoader };
}
