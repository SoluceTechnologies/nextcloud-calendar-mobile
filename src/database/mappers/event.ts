import type { Attendee, CalendarEvent } from '@/types';
import { dedupeAttendees } from '@/utils/attendees';

import Event from '../models/Event';

function parseAttendees(raw?: string): Attendee[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? dedupeAttendees(parsed as Attendee[]) : [];
  } catch {
    return [];
  }
}

function parseGeo(raw?: string): { lat: number; lon: number } | undefined {
  if (!raw) return undefined;
  const [lat, lon] = raw.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return undefined;
  return { lat, lon };
}

function parseAlarms(raw?: string, legacyMinutes?: number): number[] | undefined {
  if (raw != null) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((m): m is number => typeof m === 'number' && Number.isFinite(m));
      }
    } catch {
      // fall through to the legacy scalar column
    }
  }
  return legacyMinutes != null ? [legacyMinutes] : undefined;
}

export function mapEventToShared(event: Event): CalendarEvent {
  return {
    uid: event.uid,
    href: event.href,
    calendarId: event.calendarId,
    accountId: event.accountId,
    summary: event.summary,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    dtstart: new Date(event.start),
    dtend: new Date(event.end),
    allDay: !!event.allDay,
    color: event.color,
    attendees: parseAttendees(event.attendees),
    organizerEmail: event.organizerEmail ?? undefined,
    talkUrl: event.talkUrl ?? undefined,
    geo: parseGeo(event.geo ?? undefined),
    isRecurring: !!event.isRecurring,
    rrule: event.rrule ?? undefined,
    recurrenceId: event.recurrenceId != null ? new Date(event.recurrenceId) : undefined,
    alarms: parseAlarms(event.alarms ?? undefined, event.alarmMinutes ?? undefined),
    isTask: !!event.isTask,
  };
}
