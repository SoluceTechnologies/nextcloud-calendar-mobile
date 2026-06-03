import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { putEvent, updateEvent, deleteEvent, fetchEventIcs } from '@/api/caldav';
import { createTalkRoom } from '@/api/talk';
import { buildIcs, buildAllDayIcs, buildExceptionIcs, injectExdate, truncateRruleUntil } from '@/utils/ics';
import type { Account, CalendarMeta, CalendarEvent, CreateEventInput, RecurrenceEditScope } from '@/types';
import dayjs from 'dayjs';

function resolveTimezone(account: Account): string {
  return account.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
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

export function useCreateEvent(account: Account, calendars: CalendarMeta[]) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateEventInput) => {
      const calendar = calendars.find((c) => c.id === input.calendarId) ?? calendars[0];
      if (!calendar) throw new Error('No calendar available');

      const { location, description } = await resolveLocationAndDescription(account, input);
      const timezone = resolveTimezone(account);
      const uid = Crypto.randomUUID();
      const ics = buildIcsForInput(uid, input, location, description, timezone);
      await putEvent(account, calendar, uid, ics);
      return uid;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [account.id, 'events'] });
      queryClient.invalidateQueries({ queryKey: [account.id, 'events-detail'] });
    },
  });
}

export function useUpdateEvent(account: Account, calendars: CalendarMeta[]) {
  const queryClient = useQueryClient();

  return useMutation({
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [account.id, 'events'] });
      queryClient.invalidateQueries({ queryKey: [account.id, 'events-detail'] });
    },
  });
}

export function useDeleteEvent(account: Account) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ event, scope = 'all' }: { event: CalendarEvent; scope?: RecurrenceEditScope }) => {
      if (!account) throw new Error('account is undefined');

      if (!event.isRecurring || scope === 'all') {
        console.log('[useDeleteEvent] DELETE href:', event.href);
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
    onMutate: async ({ event }) => {
      await queryClient.cancelQueries({ queryKey: [account.id, 'events'] });
      const previous = queryClient.getQueriesData({ queryKey: [account.id, 'events'] });
      queryClient.setQueriesData({ queryKey: [account.id, 'events'] }, (old: any) =>
        Array.isArray(old) ? old.filter((e: any) => e.uid !== event.uid) : old
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      console.error('[useDeleteEvent] onError:', err);
      if (context?.previous) {
        context.previous.forEach(([key, data]) => queryClient.setQueryData(key, data));
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [account.id, 'events'] });
    },
  });
}
