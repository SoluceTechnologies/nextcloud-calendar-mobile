import { Q } from '@nozbe/watermelondb';
import { useEffect, useRef, useState } from 'react';

import type { CalendarEvent } from '@/types';

import { useDatabase } from './DatabaseProvider';
import { mapEventToShared } from './mappers/event';
import { EVENT_OBSERVED_COLUMNS } from './observedColumns';
import Event from './models/Event';

function rowKey(r: Event): string {
  // Fingerprint on the full set of fields that shape the mapped CalendarEvent.
  // This keeps the value-based comparison safe for drag-and-drop (start/end
  // change on the same model instance) while also refreshing on edits that only
  // touch metadata such as the summary, color or calendar.
  return JSON.stringify([
    r.id,
    r.accountId,
    r.calendarId,
    r.uid,
    r.href,
    r.summary,
    r.description ?? null,
    r.location ?? null,
    r.start,
    r.end,
    !!r.allDay,
    r.color,
    r.attendees ?? null,
    r.organizerEmail ?? null,
    r.talkUrl ?? null,
    !!r.isRecurring,
    r.rrule ?? null,
    r.recurrenceId ?? null,
    r.alarmMinutes ?? null,
    !!r.isTask,
  ]);
}

function eventsFingerprint(rows: Event[]): string {
  // Order-independent, value-based fingerprint. This is safe even when
  // WatermelonDB re-uses the same model instances: it only depends on the
  // observed column values at the moment of the emission.
  if (rows.length === 0) return '';
  const keys = new Array<string>(rows.length);
  for (let i = 0; i < rows.length; i++) {
    keys[i] = rowKey(rows[i]);
  }
  keys.sort();
  return keys.join('\0');
}

export function useEventsForRange(accountId: string, start: Date, end: Date, refresh = 0) {
  const database = useDatabase();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const fingerprintRef = useRef<string>('');

  useEffect(() => {
    const query = database.get<Event>('events').query(
      Q.where('account_id', accountId),
      Q.where('start', Q.lt(end.getTime())),
      Q.where('end', Q.gt(start.getTime())),
    );
    const subscription = query.observeWithColumns(EVENT_OBSERVED_COLUMNS).subscribe((rows) => {
      const fingerprint = eventsFingerprint(rows);
      if (fingerprint === fingerprintRef.current) {
        // WatermelonDB may re-emit the same rows; skip the mapping/sort and
        // avoid a new array reference for downstream memoization.
        return;
      }
      fingerprintRef.current = fingerprint;
      const next = rows
        .map(mapEventToShared)
        .sort((a, b) => a.dtstart.getTime() - b.dtstart.getTime());
      setEvents(next);
    });
    return () => subscription.unsubscribe();
  }, [accountId, start, end, database, refresh]);

  return events;
}
