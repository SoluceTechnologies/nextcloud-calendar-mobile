import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { putEvent, updateEvent, deleteEvent, fetchEventIcs } from '@/api/caldav';
import { createTalkRoom } from '@/api/talk';
import { buildIcs, buildAllDayIcs, buildExceptionIcs, injectExdate, truncateRruleUntil } from '@/utils/ics';
import { parseIcsObjects } from '@/utils/caldav-parse';
import type { Account, CalendarMeta, CalendarEvent, CreateEventInput, RecurrenceEditScope } from '@/types';
import dayjs from 'dayjs';
import {
  snapshotEvents,
  insertEvent,
  patchEvent,
  removeEventsWhere,
  seriesBaseUid,
  type EventMutationContext,
  type EventMutationMeta,
} from './eventMutationReconcile';

const TALK_URL_PATTERN = /\/call\//;

function resolveTimezone(account: Account): string {
  return account.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function resolveCalendar(calendars: CalendarMeta[], calendarId: string): CalendarMeta | undefined {
  return calendars.find((c) => c.id === calendarId) ?? calendars[0];
}

function buildIcsForInput(uid: string, input: CreateEventInput, location: string, description: string, timezone: string): string {
  return input.allDay
    ? buildAllDayIcs({
        uid,
        summary: input.summary,
        description,
        location,
        date: input.dtstart,
        organizerEmail: input.organizerEmail,
        organizerName: input.organizerName,
        attendees: input.attendees,
        rrule: input.rrule,
      })
    : buildIcs({
        uid,
        summary: input.summary,
        description,
        location,
        dtstart: input.dtstart,
        dtend: input.dtend,
        organizerEmail: input.organizerEmail,
        organizerName: input.organizerName,
        attendees: input.attendees,
        timezone,
        rrule: input.rrule,
      });
}

async function resolveLocationAndDescription(
  account: Account,
  input: CreateEventInput
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

/**
 * Normalize form dates to what the server/parser will store. The calendar lib
 * (`isAllDayEvent`) treats an event as all-day ONLY when start AND end are at
 * 00:00, and the date picker keeps the previously-selected hour. Without this,
 * an optimistic all-day event renders as a timed block at that hour until the
 * refetch. `buildAllDayIcs` writes a single day, so the optimistic copy mirrors
 * that: start and end both at local midnight of the chosen day.
 */
function inputDates(input: CreateEventInput): { dtstart: Date; dtend: Date } {
  if (input.allDay) {
    return {
      dtstart: dayjs(input.dtstart).startOf('day').toDate(),
      dtend: dayjs(input.dtstart).startOf('day').toDate(),
    };
  }
  return { dtstart: input.dtstart, dtend: input.dtend };
}

/** Build a CalendarEvent from form input — used both for the optimistic
 *  placeholder and the final reconciled event after the server confirms. */
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
    // CalendarEvent.rrule is the ICS string; the real one arrives on reconcile.
    rrule: undefined,
  };
}

/**
 * Expand a recurring event locally for the optimistic insert, so every
 * occurrence shows at once instead of just the first. We build the same ICS the
 * server will store and run it through the same parser the fetch path uses —
 * so occurrence dates, all-day handling, etc. match what the refetch returns.
 * Bounded to a window around the start date (the cached month windows);
 * `insertEvent` drops anything outside a cached window anyway.
 */
function expandOptimisticOccurrences(
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
  const queryClient = useQueryClient();

  return useMutation({
    meta: {
      eventMutation: true,
      type: 'create',
      accountId: account.id,
      errorTitle: 'Failed to create event',
    } satisfies EventMutationMeta,

    mutationFn: async (input: CreateEventInput): Promise<CalendarEvent> => {
      const calendar = resolveCalendar(calendars, input.calendarId);
      if (!calendar) throw new Error('No calendar available');

      const resolved = await resolveLocationAndDescription(account, input);
      const timezone = resolveTimezone(account);
      const uid = Crypto.randomUUID();
      const ics = buildIcsForInput(uid, input, resolved.location, resolved.description, timezone);
      await putEvent(account, calendar, uid, ics);
      // Return the real event so the cache can swap out the placeholder.
      return eventFromInput(uid, input, calendar, account, resolved);
    },

    onMutate: async (input: CreateEventInput): Promise<EventMutationContext> => {
      // Apply the optimistic insert FIRST and synchronously, so the calendar
      // paints it this frame. Do NOT await cancelQueries before this — it
      // resolves only when an in-flight events fetch settles (seconds), which
      // would gate the optimistic paint behind the very fetch it should beat.
      const previous = snapshotEvents(queryClient, account.id);

      let tempUid: string | undefined;
      const calendar = resolveCalendar(calendars, input.calendarId);
      if (calendar) {
        if (input.rrule) {
          // Recurring: expand the whole series so every occurrence appears now.
          const tempBase = `optimistic-${Crypto.randomUUID()}`;
          for (const occ of expandOptimisticOccurrences(tempBase, input, calendar, account)) {
            insertEvent(queryClient, account.id, occ);
          }
          // Multiple placeholders → the targeted refetch (needsServerReconcile)
          // replaces them with the server's expansion; no single tempUid swap.
        } else {
          tempUid = `optimistic-${Crypto.randomUUID()}`;
          insertEvent(queryClient, account.id, eventFromInput(tempUid, input, calendar, account));
        }
      }

      // Cancel in-flight refetches so a late result can't clobber the optimistic
      // data — fire-and-forget; cancellation is flagged synchronously.
      void queryClient.cancelQueries({ queryKey: [account.id, 'events'] });

      return { previous, tempUid, needsServerReconcile: !!input.rrule };
    },
    // Rollback, placeholder→real swap and recurring refetch are handled
    // centrally in the MutationCache (see src/api/queryClient.ts).
  });
}

export function useUpdateEvent(account: Account, calendars: CalendarMeta[]) {
  const queryClient = useQueryClient();

  return useMutation({
    meta: {
      eventMutation: true,
      type: 'update',
      accountId: account.id,
      errorTitle: 'Failed to update event',
    } satisfies EventMutationMeta,

    mutationFn: async ({
      event,
      input,
      scope = 'all',
    }: {
      event: CalendarEvent;
      input: CreateEventInput;
      scope?: RecurrenceEditScope;
    }) => {
      const { location, description } = await resolveLocationAndDescription(account, input);
      const timezone = resolveTimezone(account);

      if (!event.isRecurring || scope === 'all') {
        const ics = buildIcsForInput(event.uid, input, location, description, timezone);
        await updateEvent(account, event.href, ics);
        return;
      }

      if (scope === 'this') {
        const masterIcs = await fetchEventIcs(account, event.href);
        const withExdate = injectExdate(masterIcs, event.dtstart, timezone);
        await updateEvent(account, event.href, withExdate);

        const calendar = calendars.find((c) => c.id === event.calendarId)
          ?? calendars.find((c) => c.id === input.calendarId);
        if (!calendar) throw new Error('Calendar not found for exception VEVENT');
        const exceptionUid = `${event.uid}-exc-${event.dtstart.getTime()}`;
        const exIcs = buildExceptionIcs({
          uid: event.uid,
          summary: input.summary,
          description,
          location,
          dtstart: input.dtstart,
          dtend: input.dtend,
          organizerEmail: input.organizerEmail,
          organizerName: input.organizerName,
          attendees: input.attendees,
          timezone,
          recurrenceId: event.dtstart,
        });
        await putEvent(account, calendar, exceptionUid, exIcs);
        return;
      }

      if (scope === 'thisAndFollowing') {
        const masterIcs = await fetchEventIcs(account, event.href);
        const oneDayBefore = dayjs(event.dtstart).subtract(1, 'day').endOf('day').toDate();
        const truncated = truncateRruleUntil(masterIcs, oneDayBefore);
        await updateEvent(account, event.href, truncated);

        const calendar = calendars.find((c) => c.id === event.calendarId)
          ?? calendars.find((c) => c.id === input.calendarId);
        if (!calendar) throw new Error('Calendar not found for new series');
        const newUid = Crypto.randomUUID();
        const newIcs = buildIcsForInput(newUid, { ...input, dtstart: input.dtstart, dtend: input.dtend }, location, description, timezone);
        await putEvent(account, calendar, newUid, newIcs);
        return;
      }
    },

    onMutate: async ({ event, input }): Promise<EventMutationContext> => {
      // Optimistic patch first (synchronous, instant paint); cancel after.
      const previous = snapshotEvents(queryClient, account.id);

      const { dtstart, dtend } = inputDates(input);
      patchEvent(queryClient, account.id, event.uid, {
        summary: input.summary,
        dtstart,
        dtend,
        allDay: input.allDay,
        description: input.description ?? event.description,
        location: input.location ?? event.location,
        attendees: input.attendees,
      });

      void queryClient.cancelQueries({ queryKey: [account.id, 'events'] });

      // Recurring edits split/except the series server-side — reconcile via a
      // single targeted refetch; simple edits stay fully local.
      return { previous, needsServerReconcile: event.isRecurring };
    },
  });
}

export function useDeleteEvent(account: Account) {
  const queryClient = useQueryClient();

  return useMutation({
    meta: {
      eventMutation: true,
      type: 'delete',
      accountId: account.id,
      errorTitle: 'Failed to delete event',
    } satisfies EventMutationMeta,

    mutationFn: async ({ event, scope = 'all' }: { event: CalendarEvent; scope?: RecurrenceEditScope }) => {
      if (!account) throw new Error('account is undefined');

      if (!event.isRecurring || scope === 'all') {
        return deleteEvent(account, event.href);
      }

      const timezone = resolveTimezone(account);
      const masterIcs = await fetchEventIcs(account, event.href);

      if (scope === 'this') {
        const withExdate = injectExdate(masterIcs, event.dtstart, timezone);
        return updateEvent(account, event.href, withExdate);
      }

      if (scope === 'thisAndFollowing') {
        const oneDayBefore = dayjs(event.dtstart).subtract(1, 'day').endOf('day').toDate();
        const truncated = truncateRruleUntil(masterIcs, oneDayBefore);
        return updateEvent(account, event.href, truncated);
      }
    },

    onMutate: async ({ event, scope = 'all' }): Promise<EventMutationContext> => {
      // Optimistic removal first (synchronous, instant); cancel after so the
      // paint isn't gated behind an in-flight fetch settling.
      const previous = snapshotEvents(queryClient, account.id);

      // Remove optimistically to match what the server will do, so the calendar
      // is consistent immediately — not just the tapped occurrence.
      const base = seriesBaseUid(event.uid);
      if (!event.isRecurring || scope === 'all') {
        // Whole series (or a plain single event).
        removeEventsWhere(queryClient, account.id, (e) => seriesBaseUid(e.uid) === base);
      } else if (scope === 'thisAndFollowing') {
        const from = event.dtstart.getTime();
        removeEventsWhere(
          queryClient,
          account.id,
          (e) => seriesBaseUid(e.uid) === base && new Date(e.dtstart).getTime() >= from,
        );
      } else {
        // 'this' — just the tapped occurrence.
        removeEventsWhere(queryClient, account.id, (e) => e.uid === event.uid);
      }

      void queryClient.cancelQueries({ queryKey: [account.id, 'events'] });

      return { previous, needsServerReconcile: event.isRecurring };
    },
  });
}
