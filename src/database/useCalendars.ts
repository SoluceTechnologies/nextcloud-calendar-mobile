import { Q } from '@nozbe/watermelondb';
import { useEffect, useState } from 'react';

import type { CalendarMeta } from '@/types';
import { byServerOrder } from '@/utils/calendars';

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
    order: c.calendarOrder ?? undefined,
    isShared: c.isShared ?? undefined,
  };
}

export function useCalendarsFromDb(accountIds: string | string[] | null): CalendarMeta[] {
  const database = useDatabase();
  const [calendars, setCalendars] = useState<CalendarMeta[]>([]);
  const ids = accountIds == null ? null : Array.isArray(accountIds) ? accountIds : [accountIds];
  const idsKey = ids?.join('|') ?? null;

  useEffect(() => {
    if (!ids || ids.length === 0) {
      setCalendars([]);
      return;
    }
    const subscription = database
      .get<Calendar>('calendars')
      .query(Q.where('account_id', Q.oneOf(ids)))
      .observeWithColumns(CALENDAR_OBSERVED_COLUMNS)
      .subscribe((rows) => {
        const next = rows.map(mapCalendarToMeta).sort(byServerOrder);
        setCalendars((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, database]);

  return calendars;
}
