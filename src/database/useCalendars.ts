import { Q } from '@nozbe/watermelondb';
import { useEffect, useState } from 'react';

import type { CalendarMeta } from '@/types';

import { useDatabase } from './DatabaseProvider';
import { CALENDAR_OBSERVED_COLUMNS } from './observedColumns';
import Calendar from './models/Calendar';

export function mapCalendarToMeta(c: Calendar): CalendarMeta {
  return {
    id: c.remoteId,
    accountId: c.accountId,
    displayName: c.displayName,
    color: c.color,
    ctag: c.ctag,
    url: c.url,
    slug: c.slug,
    isSubscribed: c.isSubscribed ?? undefined,
    isReadOnly: c.isReadOnly ?? undefined,
    sourceUrl: c.sourceUrl ?? undefined,
    supportsEvents: c.supportsEvents ?? undefined,
  };
}

export function useCalendarsFromDb(accountId: string | null): CalendarMeta[] {
  const database = useDatabase();
  const [calendars, setCalendars] = useState<CalendarMeta[]>([]);

  useEffect(() => {
    if (!accountId) {
      setCalendars([]);
      return;
    }
    const subscription = database
      .get<Calendar>('calendars')
      .query(Q.where('account_id', accountId))
      .observeWithColumns(CALENDAR_OBSERVED_COLUMNS)
      .subscribe((rows) => {
        const next = rows.map(mapCalendarToMeta);
        setCalendars((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      });
    return () => subscription.unsubscribe();
  }, [accountId, database]);

  return calendars;
}
