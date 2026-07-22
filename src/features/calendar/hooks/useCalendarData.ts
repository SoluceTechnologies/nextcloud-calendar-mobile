import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';

import { syncEvents, syncCalendarDelta } from '@/database/sync';
import { useEventsForRange } from '@/database/useEvents';
import { useAccountStore } from '@/stores/accountStore';
import { useCalendarStore } from '@/stores/calendarStore';
import { useActiveAccount } from '@/hooks/useAccounts';
import { useCalendars } from '@/hooks/useCalendars';
import { normalizeEvents } from '@/utils/normalizeEvent';
import { monthRange } from '../utils/range';

export function useCalendarData(date: Date) {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const hiddenCalendarIds = useCalendarStore((s) => s.hiddenCalendarIds);
  const activeAccount = useActiveAccount(activeAccountId);

  const { data: calendars = [], isFetching: calsFetching } = useCalendars(activeAccount);

  const year = dayjs(date).year();
  const month = dayjs(date).month();
  const { start, end } = useMemo(() => monthRange(date), [year, month]);

  const dbEvents = useEventsForRange(activeAccountId ?? '', start, end);

  const [deltaSyncing, setDeltaSyncing] = useState(false);
  const [icsSyncing, setIcsSyncing] = useState(false);
  const syncing = deltaSyncing || icsSyncing;


  // Real CalDAV calendars: token-based whole-calendar delta. Runs on account /
  // calendar-set change only — month scrolling reads the DB, no network.
  useEffect(() => {
    if (!activeAccount) return;
    const calDav = calendars.filter((c) => !(c.isSubscribed && c.sourceUrl));
    if (calDav.length === 0) return;
    let active = true;
    setDeltaSyncing(true);
    (async () => {
      try {
        await Promise.all(calDav.map((cal) => syncCalendarDelta(activeAccount, cal)));
      } catch {
      } finally {
        if (active) setDeltaSyncing(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount?.id, calendars]);

  // Subscribed-ICS calendars have no sync-token; keep the windowed full-fetch,
  // which must re-run as the visible month (start/end) changes.
  useEffect(() => {
    if (!activeAccount) return;
    const subscribed = calendars.filter((c) => c.isSubscribed && c.sourceUrl);
    if (subscribed.length === 0) return;
    let active = true;
    setIcsSyncing(true);
    (async () => {
      try {
        await syncEvents(activeAccount, subscribed, start, end);
      } catch {
      } finally {
        if (active) setIcsSyncing(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount?.id, calendars, start.getTime(), end.getTime()]);

  const allEvents = useMemo(
    () => normalizeEvents(dbEvents.filter((e) => !hiddenCalendarIds.includes(e.calendarId))),
    [dbEvents, hiddenCalendarIds],
  );

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
