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

  const [syncing, setSyncing] = useState(false);


  useEffect(() => {
    if (!activeAccount || calendars.length === 0) return;
    let active = true;
    setSyncing(true);
    (async () => {
      try {
        await Promise.all(
          calendars.map((cal) =>
            cal.isSubscribed && cal.sourceUrl
              ? syncEvents(activeAccount, [cal], start, end)   // ICS-source: keep windowed full-fetch
              : syncCalendarDelta(activeAccount, cal),          // real CalDAV: token delta
          ),
        );
      } catch {
      } finally {
        if (active) setSyncing(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount?.id, calendars]);

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
