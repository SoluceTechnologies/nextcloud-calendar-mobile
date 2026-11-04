import { Q } from '@nozbe/watermelondb';

import { getDatabaseInstance } from '@/database/DatabaseProvider';
import type Event from '@/database/models/Event';
import { prepareCreateEvent } from '@/database/sync';
import { safeWrite } from '@/database/utils/safeTransaction';
import { fetchEventIcs } from '@/services/nextcloud/caldav';
import type { Account, CalendarEvent } from '@/types';
import { parseIcsObjectsAsync } from '@/utils/caldav-parse';

import type { ServerHit } from './serverSearch';

const DAY_MS = 86_400_000;

function closestTo(events: CalendarEvent[], target: number | undefined): CalendarEvent {
  if (target === undefined) return events[0];
  return events.reduce((closest, event) =>
    Math.abs(event.dtstart.getTime() - target) < Math.abs(closest.dtstart.getTime() - target) ? event : closest,
  );
}

export async function openServerHit(account: Account, hit: ServerHit): Promise<string> {
  const ics = await fetchEventIcs(account, hit.href);
  const target = hit.start?.getTime();
  const parsed = await parseIcsObjectsAsync(
    [{ ics, href: hit.href }],
    { calendarId: hit.calendar.id, accountId: account.id, color: hit.calendar.color },
    target === undefined ? undefined : new Date(target - DAY_MS),
    target === undefined ? undefined : new Date(target + DAY_MS),
  );
  if (parsed.length === 0) throw new Error(`openServerHit: no event parsed from ${hit.href}`);
  const chosen = closestTo(parsed, target);

  const database = getDatabaseInstance();
  const events = database.get<Event>('events');
  await safeWrite(
    database,
    async () => {
      const existing = await events
        .query(
          Q.where('account_id', account.id),
          Q.where('calendar_id', hit.calendar.id),
          Q.where('uid', chosen.uid),
        )
        .fetch();
      if (existing.length === 0) await database.batch(prepareCreateEvent(events, chosen));
    },
    20000,
    'openServerHit',
  );
  return chosen.uid;
}
