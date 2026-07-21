import { Q } from '@nozbe/watermelondb';
import { useEffect, useState } from 'react';

import type { CalendarEvent } from '@/types';

import { useDatabase } from './DatabaseProvider';
import { mapEventToShared } from './mappers/event';
import { EVENT_OBSERVED_COLUMNS } from './observedColumns';
import Event from './models/Event';

export function useEventsForRange(accountId: string, start: Date, end: Date, refresh = 0) {
  const database = useDatabase();
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    const query = database.get<Event>('events').query(
      Q.where('account_id', accountId),
      Q.where('start', Q.lt(end.getTime())),
      Q.where('end', Q.gt(start.getTime())),
    );
    const subscription = query.observeWithColumns(EVENT_OBSERVED_COLUMNS).subscribe((rows) => {
      setEvents(
        rows
          .map(mapEventToShared)
          .sort((a, b) => a.dtstart.getTime() - b.dtstart.getTime()),
      );
    });
    return () => subscription.unsubscribe();
  }, [accountId, start, end, database, refresh]);

  return events;
}
