import ICAL from 'ical.js';
import * as FileSystem from 'expo-file-system/legacy';

import { extractExtraVeventLines, parseIcsItem, parseIcsToJcal } from '@/utils/caldav-parse';
import { parseRrule } from '@/features/calendar/utils/parseRrule';
import type { InitialValues } from '@/features/event/components/EventForm';
import type { CalendarEvent } from '@/types';

const IMPORT_META = { calendarId: 'import', accountId: 'import', color: '#1976d2' };

export class IcsImportError extends Error {}

export async function readIcsUri(uri: string): Promise<string> {
  const cacheFile = `${FileSystem.cacheDirectory ?? ''}ics_import_${Date.now()}.ics`;
  if (!FileSystem.cacheDirectory) {
    throw new IcsImportError('No cache directory available');
  }

  let sourceUri = uri;
  if (uri.startsWith('content://')) {
    try {
      await FileSystem.copyAsync({ from: uri, to: cacheFile });
      sourceUri = cacheFile;
    } catch (error) {
      throw new IcsImportError(
        `Cannot read content URI: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  try {
    return await FileSystem.readAsStringAsync(sourceUri, { encoding: 'utf8' });
  } catch (error) {
    throw new IcsImportError(
      `Cannot read .ics file: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    if (sourceUri === cacheFile) {
      try {
        await FileSystem.deleteAsync(cacheFile);
      } catch {
        // ignored
      }
    }
  }
}

export function sanitizeIcs(ics: string): string {
  return ics
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?|\n/g, '\r\n')
    .trim();
}

export function parseIcsToEvents(ics: string): CalendarEvent[] {
  const parsed = parseIcsItem(
    { ics, href: 'import.ics' },
    IMPORT_META,
    undefined,
    undefined,
  );
  return parsed.filter((event) => !event.isTask);
}

export function extractOrganizerName(ics: string, uid: string): string | undefined {
  try {
    const comp = new ICAL.Component(parseIcsToJcal(ics));
    const vevent = comp
      .getAllSubcomponents('vevent')
      .find((v: ICAL.Component) => {
        if (v.getFirstPropertyValue('recurrence-id')) return false;
        return v.getFirstPropertyValue('uid') === uid;
      });
    if (!vevent) return undefined;
    const organizer = vevent.getFirstProperty('organizer');
    if (!organizer) return undefined;
    const cn = organizer.getParameter('cn') as string | undefined;
    return cn?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function eventToFormValues(
  event: CalendarEvent,
  originalIcs: string,
): InitialValues & { uid: string; extraLines: string[] } {
  return {
    summary: event.summary,
    calendarId: event.calendarId,
    allDay: event.allDay,
    dtstart: event.dtstart,
    dtend: event.dtend,
    description: event.description,
    location: event.location,
    attendees: [...event.attendees],
    rrule: parseRrule(event.rrule),
    alarmMinutes: event.alarmMinutes,
    uid: event.uid,
    extraLines: extractExtraVeventLines(originalIcs, event.uid),
  };
}
