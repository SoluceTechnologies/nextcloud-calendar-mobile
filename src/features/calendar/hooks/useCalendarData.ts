import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';

import { syncVisibleRange } from '@/database/sync';
import { useEventsForRange } from '@/database/useEvents';
import { useAccountStore } from '@/stores/accountStore';
import { useCalendarStore } from '@/stores/calendarStore';
import { useActiveAccount } from '@/hooks/useAccounts';
import { useCalendars } from '@/hooks/useCalendars';
import { normalizeEvents } from '@/utils/normalizeEvent';
import { monthRange } from '../utils/range';
import { AGENDA_FUTURE_DAYS, AGENDA_PAST_DAYS } from '../utils/agendaSections';
import type { CalendarEvent } from '@/types';

export function useCalendarData(date: Date, agendaEnabled = false) {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const hiddenCalendarIds = useCalendarStore((s) => s.hiddenCalendarIds);
  const activeAccount = useActiveAccount(activeAccountId);

  const { data: calendars = [], isFetching: calsFetching } = useCalendars(activeAccount);

  const year = dayjs(date).year();
  const month = dayjs(date).month();
  const { start, end } = useMemo(() => monthRange(date), [year, month]);

  const dbEvents = useEventsForRange(activeAccountId ?? '', start, end);
  const agendaRange = useMemo(() => ({
    start: dayjs().subtract(AGENDA_PAST_DAYS, 'day').startOf('day').toDate(),
    end: dayjs().add(AGENDA_FUTURE_DAYS, 'day').endOf('day').toDate(),
  }), []);
  const agendaDbEvents = useEventsForRange(
    agendaEnabled ? activeAccountId ?? '' : '', agendaRange.start, agendaRange.end,
  );

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
        await syncVisibleRange(activeAccount, calendars, start, end);
      } catch (error) {
        console.warn('[useCalendarData] syncVisibleRange failed:', String(error));
      } finally {
        if (active) setSyncing(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount?.id, calendars, start.getTime(), end.getTime()]);

  const prepare = useMemo(() => {
    const nonEditableCalendarIds = new Set(
      calendars.filter((c) => c.isReadOnly || c.isSubscribed).map((c) => c.id),
    );
    return (events: CalendarEvent[]) => normalizeEvents(
      events.filter((e) => !hiddenCalendarIds.includes(e.calendarId)),
    ).map((e) =>
      nonEditableCalendarIds.has(e.calendarId) ? { ...e, readOnly: true } : e,
    );
  }, [hiddenCalendarIds, calendars]);
  const allEvents = useMemo(() => prepare(dbEvents), [prepare, dbEvents]);
  const agendaEvents = useMemo(() => prepare(agendaDbEvents), [prepare, agendaDbEvents]);

  const hadEventsRef = useRef(false);
  useEffect(() => {
    if (allEvents.length > 0) hadEventsRef.current = true;
  }, [allEvents]);
  useEffect(() => {
    hadEventsRef.current = false;
  }, [activeAccountId]);

  const showFullOverlay = !hadEventsRef.current && syncing && allEvents.length === 0;
  const showSmallLoader = (syncing || calsFetching) && !showFullOverlay;

  return { activeAccount, calendars, allEvents, agendaEvents, showFullOverlay, showSmallLoader };
}
