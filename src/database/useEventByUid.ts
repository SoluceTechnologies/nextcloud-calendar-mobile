import { Q } from '@nozbe/watermelondb';
import { useEffect, useState } from 'react';

import type { CalendarEvent } from '@/types';

import { useDatabase } from './DatabaseProvider';
import { mapEventToShared } from './mappers/event';
import { EVENT_OBSERVED_COLUMNS } from './observedColumns';
import Event from './models/Event';

export function useEventByUid(
  accountId: string | null,
  uid: string | undefined,
): CalendarEvent | null | undefined {
  const database = useDatabase();
  const [event, setEvent] = useState<CalendarEvent | null | undefined>(undefined);

  useEffect(() => {
    if (!accountId || !uid) {
      setEvent(null);
      return;
    }
    setEvent(undefined);
    const subscription = database
      .get<Event>('events')
      .query(Q.where('account_id', accountId), Q.where('uid', uid))
      .observeWithColumns(EVENT_OBSERVED_COLUMNS)
      .subscribe((rows) => setEvent(rows[0] ? mapEventToShared(rows[0]) : null));
    return () => subscription.unsubscribe();
  }, [accountId, uid, database]);

  return event;
}
