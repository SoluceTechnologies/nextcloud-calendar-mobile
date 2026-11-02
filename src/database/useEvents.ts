import { Q } from '@nozbe/watermelondb';
import { useEffect, useRef, useState } from 'react';

import type { CalendarEvent } from '@/types';

import { useDatabase } from './DatabaseProvider';
import { mapEventToShared } from './mappers/event';
import { EVENT_OBSERVED_COLUMNS } from './observedColumns';
import Event from './models/Event';

function rowKey(r: Event): string {
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
      Q.where('end', Q.gte(start.getTime())),
    );
    const subscription = query.observeWithColumns(EVENT_OBSERVED_COLUMNS).subscribe((rows) => {
      const fingerprint = eventsFingerprint(rows);
      if (fingerprint === fingerprintRef.current) {
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

export function useAllEvents(accountId: string | null) {
  const database = useDatabase();
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    if (!accountId) {
      setEvents([]);
      return;
    }
    const subscription = database
      .get<Event>('events')
      .query(Q.where('account_id', accountId))
      .observeWithColumns(EVENT_OBSERVED_COLUMNS)
      .subscribe((rows) => setEvents(rows.map(mapEventToShared)));
    return () => subscription.unsubscribe();
  }, [accountId, database]);

  return events;
}
