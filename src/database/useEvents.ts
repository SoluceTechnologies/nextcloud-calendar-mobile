import { Q } from '@nozbe/watermelondb';
import { useEffect, useRef, useState } from 'react';

import type { CalendarEvent } from '@/types';

import { useDatabase } from './DatabaseProvider';
import { mapEventToShared } from './mappers/event';
import { EVENT_OBSERVED_COLUMNS } from './observedColumns';
import Event from './models/Event';

function rowsEqual(a: Event[], b: Event[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function useEventsForRange(accountId: string, start: Date, end: Date, refresh = 0) {
  const database = useDatabase();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const rowsRef = useRef<Event[]>([]);
  const eventsRef = useRef<CalendarEvent[]>([]);

  useEffect(() => {
    const query = database.get<Event>('events').query(
      Q.where('account_id', accountId),
      Q.where('start', Q.lt(end.getTime())),
      Q.where('end', Q.gt(start.getTime())),
    );
    const subscription = query.observeWithColumns(EVENT_OBSERVED_COLUMNS).subscribe((rows) => {
      if (rowsEqual(rows, rowsRef.current)) {
        // WatermelonDB may re-emit the same rows after a resubscribe; skip the
        // mapping/sort and avoid a new array reference for downstream memoization.
        return;
      }
      rowsRef.current = rows;
      const next = rows
        .map(mapEventToShared)
        .sort((a, b) => a.dtstart.getTime() - b.dtstart.getTime());
      eventsRef.current = next;
      setEvents(next);
    });
    return () => subscription.unsubscribe();
  }, [accountId, start, end, database, refresh]);

  return events;
}
