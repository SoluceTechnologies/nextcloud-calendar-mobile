import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { putEvent, updateEvent, deleteEvent } from '@/api/caldav';
import { createTalkRoom } from '@/api/talk';
import { buildIcs, buildAllDayIcs } from '@/utils/ics';
import type { Account, CalendarMeta, CalendarEvent, CreateEventInput } from '@/types';

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
      });
}

export function useCreateEvent(account: Account, calendars: CalendarMeta[]) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateEventInput) => {
      const calendar = calendars.find((c) => c.id === input.calendarId) ?? calendars[0];
      if (!calendar) throw new Error('No calendar available');

      let location = input.location ?? '';
      let description = input.description ?? '';

      if (input.withTalkRoom) {
        const room = await createTalkRoom(account, input.summary);
        location = room.url;
        description = description ? `${description}\n\nTalk: ${room.url}` : `Talk: ${room.url}`;
      }

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

export function useUpdateEvent(account: Account) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ event, input }: { event: CalendarEvent; input: CreateEventInput }) => {
      let location = input.location ?? '';
      let description = input.description ?? '';

      if (input.withTalkRoom) {
        const room = await createTalkRoom(account, input.summary);
        location = room.url;
        description = description ? `${description}\n\nTalk: ${room.url}` : `Talk: ${room.url}`;
      }

      const timezone = resolveTimezone(account);
      const ics = buildIcsForInput(event.uid, input, location, description, timezone);
      await updateEvent(account, event.href, ics);
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
    mutationFn: (event: CalendarEvent) => {
      console.log('[useDeleteEvent] DELETE href:', event.href);
      if (!account) throw new Error('account is undefined');
      return deleteEvent(account, event.href);
    },
    onMutate: async (event) => {
      await queryClient.cancelQueries({ queryKey: [account.id, 'events'] });
      const previous = queryClient.getQueriesData({ queryKey: [account.id, 'events'] });
      queryClient.setQueriesData({ queryKey: [account.id, 'events'] }, (old: any) =>
        Array.isArray(old) ? old.filter((e: any) => e.uid !== event.uid) : old
      );
      return { previous };
    },
    onError: (err, _event, context) => {
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
