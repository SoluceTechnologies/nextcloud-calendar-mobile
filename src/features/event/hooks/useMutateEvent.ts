import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import * as Crypto from 'expo-crypto';
import dayjs from 'dayjs';

import { putEvent, updateEvent, deleteEvent, moveEvent, fetchEventIcs } from '@/services/nextcloud/caldav';
import { createTalkRoom } from '@/services/nextcloud/talk';
import { describeMutationError } from '@/services/shared/errors';
import { buildIcs, buildAllDayIcs, buildExceptionIcs, injectExdate, truncateRruleUntil } from '@/utils/ics';
import { parseIcsObjects } from '@/utils/caldav-parse';
import i18n from '@/utils/i18n';
import {
  insertEvents,
  patchByUid,
  removeWhere,
  restoreSeries,
  snapshotByBase,
  seriesBaseUid,
} from '@/database/eventWrites';
import type { Account, CalendarMeta, CalendarEvent, CreateEventInput, RecurrenceEditScope } from '@/types';

const TALK_URL_PATTERN = /\/call\//;

/** Minimal { mutate, isPending } shim replacing TanStack's useMutation. */
function useAction<V>(run: (value: V) => Promise<void>): { mutate: (value: V) => void; isPending: boolean } {
  const [isPending, setIsPending] = useState(false);
  const mutate = useCallback(
    (value: V) => {
      setIsPending(true);
      run(value).finally(() => setIsPending(false));
    },
    [run],
  );
  return { mutate, isPending };
}

function resolveTimezone(account: Account): string {
  return account.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function resolveCalendar(calendars: CalendarMeta[], calendarId: string): CalendarMeta | undefined {
  return calendars.find((c) => c.id === calendarId) ?? calendars[0];
}

function buildIcsForInput(uid: string, input: CreateEventInput, location: string, description: string, timezone: string): string {
  return input.allDay
    ? buildAllDayIcs({
        uid, summary: input.summary, description, location,
        dtstart: input.dtstart, dtend: input.dtend,
        organizerEmail: input.organizerEmail, organizerName: input.organizerName,
        attendees: input.attendees, rrule: input.rrule,
      })
    : buildIcs({
        uid, summary: input.summary, description, location,
        dtstart: input.dtstart, dtend: input.dtend,
        organizerEmail: input.organizerEmail, organizerName: input.organizerName,
        attendees: input.attendees, timezone, rrule: input.rrule,
      });
}

async function resolveLocationAndDescription(
  account: Account,
  input: CreateEventInput,
): Promise<{ location: string; description: string }> {
  let location = input.location ?? '';
  let description = input.description ?? '';
  if (input.withTalkRoom) {
    const room = await createTalkRoom(account, input.summary, input.talkRoomType ?? 'private');
    location = room.url;
    description = description ? `${description}\n\nTalk: ${room.url}` : `Talk: ${room.url}`;
  }
  return { location, description };
}

function inputDates(input: CreateEventInput): { dtstart: Date; dtend: Date } {
  if (input.allDay) {
    return {
      dtstart: dayjs(input.dtstart).startOf('day').toDate(),
      dtend: dayjs(input.dtend).startOf('day').toDate(),
    };
  }
  return { dtstart: input.dtstart, dtend: input.dtend };
}

function eventFromInput(
  uid: string,
  input: CreateEventInput,
  calendar: CalendarMeta,
  account: Account,
  resolved?: { location: string; description: string },
): CalendarEvent {
  const location = resolved?.location ?? input.location ?? '';
  const description = resolved?.description ?? input.description ?? '';
  const { dtstart, dtend } = inputDates(input);
  return {
    uid,
    href: `${calendar.url}${uid}.ics`,
    calendarId: calendar.id,
    accountId: account.id,
    summary: input.summary,
    description: description || undefined,
    location: location || undefined,
    dtstart,
    dtend,
    allDay: input.allDay,
    color: calendar.color,
    attendees: input.attendees,
    organizerEmail: input.organizerEmail,
    talkUrl: TALK_URL_PATTERN.test(location) ? location : undefined,
    isRecurring: !!input.rrule,
    rrule: undefined,
  };
}

function expandOccurrences(
  baseUid: string,
  input: CreateEventInput,
  calendar: CalendarMeta,
  account: Account,
): CalendarEvent[] {
  const timezone = resolveTimezone(account);
  const ics = buildIcsForInput(baseUid, input, input.location ?? '', input.description ?? '', timezone);
  const rangeStart = dayjs(input.dtstart).subtract(1, 'month').toDate();
  const rangeEnd = dayjs(input.dtstart).add(3, 'month').toDate();
  return parseIcsObjects(
    [{ ics, href: `${calendar.url}${baseUid}.ics` }],
    { calendarId: calendar.id, accountId: account.id, color: calendar.color },
    rangeStart,
    rangeEnd,
  );
}

export function useCreateEvent(account: Account, calendars: CalendarMeta[]) {
  return useAction<CreateEventInput>(
    useCallback(async (input: CreateEventInput) => {
      const calendar = resolveCalendar(calendars, input.calendarId);
      if (!calendar) return;

      const tempBase = `optimistic-${Crypto.randomUUID()}`;
      const optimistic = input.rrule
        ? expandOccurrences(tempBase, input, calendar, account)
        : [eventFromInput(tempBase, input, calendar, account)];
      await insertEvents(optimistic);

      try {
        const resolved = await resolveLocationAndDescription(account, input);
        const timezone = resolveTimezone(account);
        const uid = Crypto.randomUUID();
        const ics = buildIcsForInput(uid, input, resolved.location, resolved.description, timezone);
        await putEvent(account, calendar, uid, ics);

        await removeWhere(account.id, (e) => seriesBaseUid(e.uid) === tempBase);
        const real = input.rrule
          ? expandOccurrences(uid, input, calendar, account)
          : [eventFromInput(uid, input, calendar, account, resolved)];
        await insertEvents(real);
      } catch (error) {
        await removeWhere(account.id, (e) => seriesBaseUid(e.uid) === tempBase);
        Alert.alert(i18n.t('event.errorCreateFailed'), describeMutationError(error));
      }
    }, [account, calendars]),
  );
}

export function useUpdateEvent(account: Account, calendars: CalendarMeta[]) {
  return useAction<{ event: CalendarEvent; input: CreateEventInput; scope?: RecurrenceEditScope }>(
    useCallback(async ({ event, input, scope = 'all' }) => {
      const base = seriesBaseUid(event.uid);
      const snapshot = await snapshotByBase(account.id, base);

      const { dtstart, dtend } = inputDates(input);
      const calendarChanged = !event.isRecurring && input.calendarId !== event.calendarId;
      const targetCal = calendarChanged ? calendars.find((c) => c.id === input.calendarId) : undefined;
      await patchByUid(account.id, event.uid, {
        summary: input.summary,
        dtstart,
        dtend,
        allDay: input.allDay,
        description: input.description ?? event.description,
        location: input.location ?? event.location,
        attendees: input.attendees,
        ...(targetCal && {
          calendarId: targetCal.id,
          color: targetCal.color,
          href: `${targetCal.url}${event.uid}.ics`,
        }),
      });

      try {
        const { location, description } = await resolveLocationAndDescription(account, input);
        const timezone = resolveTimezone(account);

        if (!event.isRecurring || scope === 'all') {
          const ics = buildIcsForInput(event.uid, input, location, description, timezone);
          await updateEvent(account, event.href, ics);
          if (!event.isRecurring && input.calendarId !== event.calendarId) {
            const cal = calendars.find((c) => c.id === input.calendarId);
            if (!cal) throw new Error('Target calendar not found');
            await moveEvent(account, event.href, cal, event.uid);
          }
        } else if (scope === 'this') {
          const masterIcs = await fetchEventIcs(account, event.href);
          await updateEvent(account, event.href, injectExdate(masterIcs, event.dtstart, timezone));
          const cal = calendars.find((c) => c.id === event.calendarId) ?? calendars.find((c) => c.id === input.calendarId);
          if (!cal) throw new Error('Calendar not found for exception VEVENT');
          const exceptionUid = `${event.uid}-exc-${event.dtstart.getTime()}`;
          const exIcs = buildExceptionIcs({
            uid: event.uid, summary: input.summary, description, location,
            dtstart: input.dtstart, dtend: input.dtend,
            organizerEmail: input.organizerEmail, organizerName: input.organizerName,
            attendees: input.attendees, timezone, recurrenceId: event.dtstart,
          });
          await putEvent(account, cal, exceptionUid, exIcs);
        } else if (scope === 'thisAndFollowing') {
          const masterIcs = await fetchEventIcs(account, event.href);
          const oneDayBefore = dayjs(event.dtstart).subtract(1, 'day').endOf('day').toDate();
          await updateEvent(account, event.href, truncateRruleUntil(masterIcs, oneDayBefore));
          const cal = calendars.find((c) => c.id === event.calendarId) ?? calendars.find((c) => c.id === input.calendarId);
          if (!cal) throw new Error('Calendar not found for new series');
          const newUid = Crypto.randomUUID();
          await putEvent(account, cal, newUid, buildIcsForInput(newUid, input, location, description, timezone));
        }
      } catch (error) {
        await restoreSeries(account.id, base, snapshot);
        Alert.alert(i18n.t('event.errorUpdateFailed'), describeMutationError(error));
      }
    }, [account, calendars]),
  );
}

export function useDeleteEvent(account: Account) {
  return useAction<{ event: CalendarEvent; scope?: RecurrenceEditScope }>(
    useCallback(async ({ event, scope = 'all' }) => {
      const base = seriesBaseUid(event.uid);
      let removed: CalendarEvent[];
      if (!event.isRecurring || scope === 'all') {
        removed = await removeWhere(account.id, (e) => seriesBaseUid(e.uid) === base);
      } else if (scope === 'thisAndFollowing') {
        const from = event.dtstart.getTime();
        removed = await removeWhere(
          account.id,
          (e) => seriesBaseUid(e.uid) === base && new Date(e.dtstart).getTime() >= from,
        );
      } else {
        removed = await removeWhere(account.id, (e) => e.uid === event.uid);
      }

      try {
        if (!event.isRecurring || scope === 'all') {
          await deleteEvent(account, event.href);
          return;
        }
        const timezone = resolveTimezone(account);
        const masterIcs = await fetchEventIcs(account, event.href);
        if (scope === 'this') {
          await updateEvent(account, event.href, injectExdate(masterIcs, event.dtstart, timezone));
        } else if (scope === 'thisAndFollowing') {
          const oneDayBefore = dayjs(event.dtstart).subtract(1, 'day').endOf('day').toDate();
          await updateEvent(account, event.href, truncateRruleUntil(masterIcs, oneDayBefore));
        }
      } catch (error) {
        await insertEvents(removed);
        Alert.alert(i18n.t('event.errorDeleteFailed'), describeMutationError(error));
      }
    }, [account]),
  );
}
