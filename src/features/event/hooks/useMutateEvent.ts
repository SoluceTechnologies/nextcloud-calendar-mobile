import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import * as Crypto from 'expo-crypto';
import dayjs from 'dayjs';

import { putEvent, updateEvent, deleteEvent, moveEvent, fetchEventIcs } from '@/services/nextcloud/caldav';
import { createTalkRoom } from '@/services/nextcloud/talk';
import { describeMutationError } from '@/services/shared/errors';
import { buildIcs, buildAllDayIcs, buildExceptionIcs, injectExdate, truncateRruleUntil, shiftIcsDates } from '@/utils/ics';
import { parseIcsObjects, extractDtstartTzid, extractSequence, extractDtstartDtend, extractExtraVeventLines } from '@/utils/caldav-parse';
import { isValidTimeZone } from '@/utils/timezone';
import i18n from '@/utils/i18n';
import {
  insertEvents,
  patchByUid,
  removeWhere,
  restoreSeries,
  snapshotByBase,
  seriesBaseUid,
  shiftSeriesDates,
} from '@/database/eventWrites';
import { exceptionResourceUid, occurrenceSlot } from '@/features/event/occurrenceTarget';
import type { Account, CalendarMeta, CalendarEvent, CreateEventInput, RecurrenceEditScope } from '@/types';

const TALK_URL_PATTERN = /\/call\//;

export function seriesDeltas(
  occurrence: { dtstart: Date; dtend: Date },
  nextStart: Date,
  nextEnd: Date,
): { deltaStart: number; deltaEnd: number } {
  return {
    deltaStart: nextStart.getTime() - occurrence.dtstart.getTime(),
    deltaEnd: nextEnd.getTime() - occurrence.dtend.getTime(),
  };
}

export function shiftedMasterInput(
  input: CreateEventInput,
  masterBounds: { dtstart: Date; dtend: Date },
  deltaStart: number,
  deltaEnd: number,
): CreateEventInput {
  return {
    ...input,
    dtstart: new Date(masterBounds.dtstart.getTime() + deltaStart),
    dtend: new Date(masterBounds.dtend.getTime() + deltaEnd),
  };
}

function useAction<V>(run: (value: V) => Promise<void>): {
  mutate: (value: V) => void;
  mutateAsync: (value: V) => Promise<void>;
  isPending: boolean;
} {
  const [isPending, setIsPending] = useState(false);
  const mutateAsync = useCallback(
    async (value: V) => {
      setIsPending(true);
      try {
        await run(value);
      } finally {
        setIsPending(false);
      }
    },
    [run],
  );
  const mutate = useCallback((value: V) => { void mutateAsync(value); }, [mutateAsync]);
  return { mutate, mutateAsync, isPending };
}

function resolveTimezone(account: Account): string {
  if (account.timezone && isValidTimeZone(account.timezone)) return account.timezone;
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isValidTimeZone(deviceTz) ? deviceTz : 'UTC';
}

function resolveCalendar(calendars: CalendarMeta[], calendarId: string): CalendarMeta | undefined {
  return calendars.find((c) => c.id === calendarId) ?? calendars[0];
}

function buildIcsForInput(
  uid: string,
  input: CreateEventInput,
  location: string,
  description: string,
  timezone: string,
  sequence = 0,
  extraLines: string[] = [],
): string {
  return input.allDay
    ? buildAllDayIcs({
        uid, summary: input.summary, description, location,
        dtstart: input.dtstart, dtend: input.dtend,
        organizerEmail: input.organizerEmail, organizerName: input.organizerName,
        attendees: input.attendees, rrule: input.rrule, alarmMinutes: input.alarmMinutes,
        sequence, extraLines,
      })
    : buildIcs({
        uid, summary: input.summary, description, location,
        dtstart: input.dtstart, dtend: input.dtend,
        organizerEmail: input.organizerEmail, organizerName: input.organizerName,
        attendees: input.attendees, timezone, rrule: input.rrule, alarmMinutes: input.alarmMinutes,
        sequence, extraLines,
      });
}

function withServerOrganizer(input: CreateEventInput, event: CalendarEvent): CreateEventInput {
  return event.organizerEmail
    ? { ...input, organizerEmail: event.organizerEmail }
    : input;
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
    alarmMinutes: input.alarmMinutes,
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

      const uid = Crypto.randomUUID();
      const optimistic = input.rrule
        ? expandOccurrences(uid, input, calendar, account)
        : [eventFromInput(uid, input, calendar, account)];
      await insertEvents(optimistic);

      try {
        const resolved = await resolveLocationAndDescription(account, input);
        const timezone = resolveTimezone(account);
        const ics = buildIcsForInput(uid, input, resolved.location, resolved.description, timezone);
        await putEvent(account, calendar, uid, ics);

        const real = input.rrule
          ? expandOccurrences(uid, input, calendar, account)
          : [eventFromInput(uid, input, calendar, account, resolved)];
        await insertEvents(real);
      } catch (error) {
        await removeWhere(account.id, (e) => seriesBaseUid(e.uid) === uid);
        Alert.alert(i18n.t('event.errorCreateFailed'), describeMutationError(error));
      }
    }, [account, calendars]),
  );
}

export function useUpdateEvent(account: Account, calendars: CalendarMeta[]) {
  return useAction<{ event: CalendarEvent; input: CreateEventInput; scope?: RecurrenceEditScope; datesOnly?: boolean }>(
    useCallback(async ({ event, input, scope = 'all', datesOnly = false }) => {
      const base = seriesBaseUid(event.uid);
      const snapshot = await snapshotByBase(account.id, base);

      const { dtstart, dtend } = inputDates(input);
      const { deltaStart, deltaEnd } = seriesDeltas(event, dtstart, dtend);
      const shiftsWholeSeries = event.isRecurring && scope === 'all';
      const calendarChanged = !event.isRecurring && input.calendarId !== event.calendarId;
      const targetCal = calendarChanged ? calendars.find((c) => c.id === input.calendarId) : undefined;

      const nonTemporalPatch = {
        summary: input.summary,
        allDay: input.allDay,
        description: input.description ?? event.description,
        location: input.location ?? event.location,
        attendees: input.attendees,
        alarmMinutes: input.alarmMinutes,
      };

      if (shiftsWholeSeries) {
        await shiftSeriesDates(account.id, base, deltaStart, deltaEnd, datesOnly ? {} : nonTemporalPatch);
      } else {
        await patchByUid(account.id, event.uid, {
          ...(datesOnly ? {} : nonTemporalPatch),
          dtstart,
          dtend,
          ...(targetCal && {
            calendarId: targetCal.id,
            color: targetCal.color,
            href: `${targetCal.url}${event.uid}.ics`,
          }),
        });
      }

      try {
        const { location, description } = await resolveLocationAndDescription(account, input);
        let timezone = resolveTimezone(account);
        const scheduled = withServerOrganizer(input, event);

        if (!event.isRecurring || scope === 'all') {
          if (datesOnly) {
            // Drag & drop only moves the event in time. Patch DTSTART/DTEND on
            // the authoritative server copy so description, location, attendees
            // and any other property are kept — never rebuilt from the local
            // event, which the grid may hold only partially.
            const masterIcs = await fetchEventIcs(account, event.href);
            const tz = extractDtstartTzid(masterIcs) ?? timezone;
            const sequence = extractSequence(masterIcs) + 1;
            let newStart = input.dtstart;
            let newEnd = input.dtend;
            if (event.isRecurring) {
              const bounds = extractDtstartDtend(masterIcs);
              if (!bounds) throw new Error('Cannot read the series master to shift it');
              newStart = new Date(bounds.dtstart.getTime() + deltaStart);
              newEnd = new Date(bounds.dtend.getTime() + deltaEnd);
            }
            await updateEvent(account, event.href, shiftIcsDates(masterIcs, newStart, newEnd, tz, input.allDay, sequence));
          } else {
            let uid = event.uid;
            let masterInput = scheduled;
            let sequence = 0;
            let preserved: string[] = [];
            if (event.isRecurring) {
              const masterIcs = await fetchEventIcs(account, event.href);
              timezone = extractDtstartTzid(masterIcs) ?? timezone;
              sequence = extractSequence(masterIcs) + 1;
              preserved = extractExtraVeventLines(masterIcs);
              const bounds = extractDtstartDtend(masterIcs);
              if (!bounds) throw new Error('Cannot read the series master to shift it');
              uid = seriesBaseUid(event.uid);
              masterInput = shiftedMasterInput(scheduled, bounds, deltaStart, deltaEnd);
            } else {
              try {
                const masterIcs = await fetchEventIcs(account, event.href);
                sequence = extractSequence(masterIcs) + 1;
                preserved = extractExtraVeventLines(masterIcs);
              } catch (error) {
                console.warn('[useUpdateEvent] failed to fetch master ics for sequence/extra lines:', error);
              }
            }
            await updateEvent(account, event.href, buildIcsForInput(uid, masterInput, location, description, timezone, sequence, preserved));
          }
          if (!event.isRecurring && input.calendarId !== event.calendarId) {
            const cal = calendars.find((c) => c.id === input.calendarId);
            if (!cal) throw new Error('Target calendar not found');
            await moveEvent(account, event.href, cal, event.uid);
          }
        } else if (scope === 'this') {
          const slot = occurrenceSlot(event);
          const masterIcs = await fetchEventIcs(account, event.href);
          await updateEvent(account, event.href, injectExdate(masterIcs, slot, timezone));
          const cal = calendars.find((c) => c.id === event.calendarId) ?? calendars.find((c) => c.id === input.calendarId);
          if (!cal) throw new Error('Calendar not found for exception VEVENT');
          const exceptionUid = exceptionResourceUid(event);
          const exIcs = buildExceptionIcs({
            uid: seriesBaseUid(event.uid), summary: input.summary, description, location,
            dtstart: input.dtstart, dtend: input.dtend,
            organizerEmail: scheduled.organizerEmail, organizerName: input.organizerName,
            attendees: input.attendees, timezone, recurrenceId: slot,
            sequence: extractSequence(masterIcs) + 1,
            extraLines: extractExtraVeventLines(masterIcs),
          });
          await putEvent(account, cal, exceptionUid, exIcs);
        } else if (scope === 'thisAndFollowing') {
          const masterIcs = await fetchEventIcs(account, event.href);
          const oneDayBefore = dayjs(occurrenceSlot(event)).subtract(1, 'day').endOf('day').toDate();
          await updateEvent(account, event.href, truncateRruleUntil(masterIcs, oneDayBefore));
          const cal = calendars.find((c) => c.id === event.calendarId) ?? calendars.find((c) => c.id === input.calendarId);
          if (!cal) throw new Error('Calendar not found for new series');
          const newUid = Crypto.randomUUID();
          await putEvent(account, cal, newUid, buildIcsForInput(newUid, scheduled, location, description, timezone, 0, extractExtraVeventLines(masterIcs)));
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
        const from = occurrenceSlot(event).getTime();
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
          await updateEvent(account, event.href, injectExdate(masterIcs, occurrenceSlot(event), timezone));
        } else if (scope === 'thisAndFollowing') {
          const oneDayBefore = dayjs(occurrenceSlot(event)).subtract(1, 'day').endOf('day').toDate();
          await updateEvent(account, event.href, truncateRruleUntil(masterIcs, oneDayBefore));
        }
      } catch (error) {
        await insertEvents(removed);
        Alert.alert(i18n.t('event.errorDeleteFailed'), describeMutationError(error));
      }
    }, [account]),
  );
}
