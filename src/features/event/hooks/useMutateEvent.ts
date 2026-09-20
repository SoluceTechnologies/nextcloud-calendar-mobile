import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import * as Crypto from 'expo-crypto';
import dayjs from 'dayjs';

import { putEvent, updateEvent, deleteEvent, moveEvent, fetchEventIcsWithEtag } from '@/services/nextcloud/caldav';
import { deleteRemoteFile, uploadAttachmentFile } from '@/services/nextcloud/files';
import { createTalkRoom } from '@/services/nextcloud/talk';
import { describeMutationError } from '@/services/shared/errors';
import { buildAttachLine, injectAttachLine, removeAttachLine } from '@/features/event/utils/attachmentWrite';
import { buildIcs, buildAllDayIcs, buildExceptionIcs, injectExdate, truncateRruleUntil, shiftIcsDates } from '@/utils/ics';
import { parseIcsObjects, extractDtstartTzid, extractSequence, extractDtstartDtend, extractExtraVeventLines } from '@/utils/caldav-parse';
import { isValidTimeZone } from '@/utils/timezone';
import { allDayAlarmMinutes } from '@/features/notifications/alerts';
import { useSettingsStore } from '@/stores/settingsStore';
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
import { syncCalendarDelta } from '@/database/sync';
import { exceptionResourceUid, occurrenceSlot } from '@/features/event/occurrenceTarget';
import type { Account, CalendarMeta, CalendarEvent, CreateEventInput, RecurrenceEditScope } from '@/types';

const TALK_URL_PATTERN = /\/call\//;

/**
 * Applies the attachment delta carried by a form submit to a built ICS:
 * strips `removedAttachments` lines, uploads `pendingAttachments` to Files and
 * injects their ATTACH lines. Upload failures never block the event save —
 * they are counted so the caller can warn once.
 */
async function applyAttachmentDelta(
  account: Account,
  ics: string,
  input: CreateEventInput,
): Promise<{ ics: string; failures: number; uploadedPaths: string[] }> {
  let out = ics;
  for (const att of input.removedAttachments ?? []) {
    out = removeAttachLine(out, att);
  }
  let failures = 0;
  const uploadedPaths: string[] = [];
  for (const pending of input.pendingAttachments ?? []) {
    try {
      const up = await uploadAttachmentFile(account, pending.name, pending.contentBase64, pending.mimeType);
      uploadedPaths.push(up.path);
      out = injectAttachLine(
        out,
        buildAttachLine({
          uri: up.davUrl,
          filename: up.filename,
          fmttype: pending.mimeType,
          size: pending.size,
        }),
      );
    } catch (error) {
      failures++;
      console.warn('[attachments] pending upload failed', pending.name, error);
    }
  }
  return { ics: out, failures, uploadedPaths };
}

/**
 * Deletes files that were uploaded but never made it into a stored ICS — call
 * only when the write that would have referenced them did not happen.
 */
async function cleanupUploaded(account: Account, paths: string[] | undefined): Promise<void> {
  for (const path of paths ?? []) {
    try {
      await deleteRemoteFile(account, path);
    } catch (error) {
      console.warn('[attachments] orphan upload cleanup failed', path, error);
    }
  }
}

function warnAttachmentFailures(failures: number) {
  if (failures > 0) Alert.alert(i18n.t('event.attachmentAddError'));
}

function hasAttachmentDelta(input: CreateEventInput): boolean {
  return !!(input.pendingAttachments?.length || input.removedAttachments?.length);
}

/** Attachments live in the ICS blob — refresh local rows so the UI reflects them. */
async function resyncAfterAttachmentDelta(
  account: Account,
  calendar: CalendarMeta | undefined,
  input: CreateEventInput,
): Promise<void> {
  if (!calendar || !hasAttachmentDelta(input)) return;
  try {
    await syncCalendarDelta(account, calendar);
  } catch (error) {
    console.warn('[attachments] post-save resync failed', error);
  }
}

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

function resolveAlarms(input: CreateEventInput): number[] | undefined {
  if (input.alarms !== undefined) return input.alarms;
  const { timedAlerts, allDayAlerts } = useSettingsStore.getState();
  const defaults = input.allDay ? allDayAlerts.map(allDayAlarmMinutes) : timedAlerts;
  return defaults.length ? defaults : undefined;
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
  const alarms = resolveAlarms(input);
  return input.allDay
    ? buildAllDayIcs({
        uid, summary: input.summary, description, location,
        dtstart: input.dtstart, dtend: input.dtend,
        organizerEmail: input.organizerEmail, organizerName: input.organizerName,
        attendees: input.attendees, rrule: input.rrule, alarms,
        sequence, extraLines,
      })
    : buildIcs({
        uid, summary: input.summary, description, location,
        dtstart: input.dtstart, dtend: input.dtend,
        organizerEmail: input.organizerEmail, organizerName: input.organizerName,
        attendees: input.attendees, timezone, rrule: input.rrule, alarms,
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
    alarms: resolveAlarms(input),
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

      let resolved: { location: string; description: string };
      let failures = 0;
      let uploadedPaths: string[] = [];
      try {
        resolved = await resolveLocationAndDescription(account, input);
        const timezone = resolveTimezone(account);
        const built = buildIcsForInput(uid, input, resolved.location, resolved.description, timezone);
        const delta = await applyAttachmentDelta(account, built, input);
        failures = delta.failures;
        uploadedPaths = delta.uploadedPaths;
        await putEvent(account, calendar, uid, delta.ics);
      } catch (error) {
        await removeWhere(account.id, (e) => seriesBaseUid(e.uid) === uid);
        // The event was never created — uploaded files would be orphaned.
        await cleanupUploaded(account, uploadedPaths);
        Alert.alert(i18n.t('event.errorCreateFailed'), describeMutationError(error));
        return;
      }

      // The PUT succeeded — the event exists on the server. Local writes are
      // best-effort: a failure must not report "create failed"; the delta sync
      // reconciles local state from the server.
      let resync = hasAttachmentDelta(input);
      const real = input.rrule
        ? expandOccurrences(uid, input, calendar, account)
        : [eventFromInput(uid, input, calendar, account, resolved)];
      try {
        await insertEvents(real);
      } catch (error) {
        console.warn('[useCreateEvent] post-PUT local write failed; forcing resync', error);
        resync = true;
      }
      warnAttachmentFailures(failures);
      if (resync) {
        try {
          await syncCalendarDelta(account, calendar);
        } catch (error) {
          console.warn('[useCreateEvent] post-save resync failed', error);
        }
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
        alarms: resolveAlarms(input),
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
            const { ics: masterIcs, etag } = await fetchEventIcsWithEtag(account, event.href);
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
            const shifted = shiftIcsDates(masterIcs, newStart, newEnd, tz, input.allDay, sequence);
            const delta = await applyAttachmentDelta(account, shifted, input);
            try {
              await updateEvent(account, event.href, delta.ics, etag);
            } catch (error) {
              await cleanupUploaded(account, delta.uploadedPaths);
              throw error;
            }
            warnAttachmentFailures(delta.failures);
          } else {
            let uid = event.uid;
            let masterInput = scheduled;
            let sequence = 0;
            let preserved: string[] = [];
            let etag: string | undefined;
            if (event.isRecurring) {
              const master = await fetchEventIcsWithEtag(account, event.href);
              const masterIcs = master.ics;
              etag = master.etag;
              timezone = extractDtstartTzid(masterIcs) ?? timezone;
              sequence = extractSequence(masterIcs) + 1;
              preserved = extractExtraVeventLines(masterIcs);
              const bounds = extractDtstartDtend(masterIcs);
              if (!bounds) throw new Error('Cannot read the series master to shift it');
              uid = seriesBaseUid(event.uid);
              masterInput = shiftedMasterInput(scheduled, bounds, deltaStart, deltaEnd);
            } else {
              try {
                const master = await fetchEventIcsWithEtag(account, event.href);
                etag = master.etag;
                sequence = extractSequence(master.ics) + 1;
                preserved = extractExtraVeventLines(master.ics);
              } catch (error) {
                console.warn('[useUpdateEvent] failed to fetch master ics for sequence/extra lines:', error);
              }
            }
            const rebuilt = buildIcsForInput(uid, masterInput, location, description, timezone, sequence, preserved);
            const delta = await applyAttachmentDelta(account, rebuilt, input);
            try {
              await updateEvent(account, event.href, delta.ics, etag);
            } catch (error) {
              await cleanupUploaded(account, delta.uploadedPaths);
              throw error;
            }
            warnAttachmentFailures(delta.failures);
          }
          if (!event.isRecurring && input.calendarId !== event.calendarId) {
            const cal = calendars.find((c) => c.id === input.calendarId);
            if (!cal) throw new Error('Target calendar not found');
            await moveEvent(account, event.href, cal, event.uid);
          }
        } else if (scope === 'this') {
          const slot = occurrenceSlot(event);
          const { ics: masterIcs, etag } = await fetchEventIcsWithEtag(account, event.href);
          // Attachments are series-level: the delta is applied to the master
          // (which also gains the EXDATE), never to the exception VEVENT.
          const delta = await applyAttachmentDelta(account, masterIcs, input);
          try {
            await updateEvent(account, event.href, injectExdate(delta.ics, slot, timezone), etag);
          } catch (error) {
            await cleanupUploaded(account, delta.uploadedPaths);
            throw error;
          }
          warnAttachmentFailures(delta.failures);
          const cal = calendars.find((c) => c.id === event.calendarId) ?? calendars.find((c) => c.id === input.calendarId);
          if (!cal) throw new Error('Calendar not found for exception VEVENT');
          const exceptionUid = exceptionResourceUid(event);
          const exIcs = buildExceptionIcs({
            uid: seriesBaseUid(event.uid), summary: input.summary, description, location,
            dtstart: input.dtstart, dtend: input.dtend,
            organizerEmail: scheduled.organizerEmail, organizerName: input.organizerName,
            attendees: input.attendees, timezone, recurrenceId: slot,
            alarms: resolveAlarms(input),
            sequence: extractSequence(masterIcs) + 1,
            // ATTACH must not be copied into the exception (it inherits the
            // master's attachments at parse time — a copy would go stale), and
            // EXDATE lines are meaningless on a RECURRENCE-ID component.
            extraLines: extractExtraVeventLines(delta.ics).filter(
              (l) => !/^(attach|exdate)[;:]/i.test(l),
            ),
          });
          await putEvent(account, cal, exceptionUid, exIcs);
        } else if (scope === 'thisAndFollowing') {
          const { ics: masterIcs, etag } = await fetchEventIcsWithEtag(account, event.href);
          const oneDayBefore = dayjs(occurrenceSlot(event)).subtract(1, 'day').endOf('day').toDate();
          const cal = calendars.find((c) => c.id === event.calendarId) ?? calendars.find((c) => c.id === input.calendarId);
          if (!cal) throw new Error('Calendar not found for new series');
          const newUid = Crypto.randomUUID();
          const seriesIcs = buildIcsForInput(newUid, scheduled, location, description, timezone, 0, extractExtraVeventLines(masterIcs));
          const delta = await applyAttachmentDelta(account, seriesIcs, input);
          try {
            await updateEvent(account, event.href, truncateRruleUntil(masterIcs, oneDayBefore), etag);
            // The pending uploads are only referenced by the new series ICS —
            // if either write fails they are orphans.
            await putEvent(account, cal, newUid, delta.ics);
          } catch (error) {
            await cleanupUploaded(account, delta.uploadedPaths);
            throw error;
          }
          warnAttachmentFailures(delta.failures);
        }
        // Resync the source calendar and, when the event moved, the target one.
        const affectedCalIds = new Set([event.calendarId, input.calendarId]);
        for (const id of affectedCalIds) {
          await resyncAfterAttachmentDelta(
            account,
            calendars.find((c) => c.id === id),
            input,
          );
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
        const { ics: masterIcs, etag } = await fetchEventIcsWithEtag(account, event.href);
        if (scope === 'this') {
          await updateEvent(account, event.href, injectExdate(masterIcs, occurrenceSlot(event), timezone), etag);
        } else if (scope === 'thisAndFollowing') {
          const oneDayBefore = dayjs(occurrenceSlot(event)).subtract(1, 'day').endOf('day').toDate();
          await updateEvent(account, event.href, truncateRruleUntil(masterIcs, oneDayBefore), etag);
        }
      } catch (error) {
        await insertEvents(removed);
        Alert.alert(i18n.t('event.errorDeleteFailed'), describeMutationError(error));
      }
    }, [account]),
  );
}
