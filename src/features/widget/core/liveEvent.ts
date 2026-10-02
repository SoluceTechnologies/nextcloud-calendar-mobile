import type { CalendarEvent } from '@/types';
import i18n from '@/utils/i18n';
import { type LiveEventState, eventDeepLink } from './types';

export function stripUrls(raw: string): string {
  return raw
    .replace(/(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s)\]}>]+/gi, ' ')
    .replace(/(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s)\]}>]*)?/gi, ' ')
    .replace(/[([{<]\s*[)\]}>]/g, ' ');
}

export function displayLocation(raw: string | undefined): string {
  if (!raw) return '';
  const cleaned = stripUrls(raw)
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—|,;:·•]+|[\s\-–—|,;:·•]+$/g, '')
    .trim();
  if (cleaned) return cleaned;
  const provider = meetingProvider(raw);
  return provider ? i18n.t('widget.videoConference', { provider }) : '';
}


const MEETING_PROVIDERS: [RegExp, string][] = [
  [/\/call\//i, 'Talk'], // Nextcloud Talk
  [/teams\.(?:microsoft\.(?:com|us)|live\.com)/i, 'Teams'],
  [/meet\.google\.com/i, 'Google Meet'],
  [/(?:\.|\/\/)zoom\.us\//i, 'Zoom'],
  [/whereby\.com/i, 'Whereby'],
  [/jit\.si/i, 'Jitsi'],
  [/webex\.com/i, 'Webex'],
];


export function meetingProvider(raw: string | undefined): string | null {
  if (!raw) return null;
  for (const [pattern, name] of MEETING_PROVIDERS) {
    if (pattern.test(raw)) return name;
  }
  return null;
}

export function selectOngoingEvent(events: CalendarEvent[], now: Date = new Date()): LiveEventState | null {
  const t = now.getTime();
  const ongoing = events
    .filter((e) => !e.allDay && e.dtstart.getTime() <= t && e.dtend.getTime() > t)
    .sort((a, b) => a.dtend.getTime() - b.dtend.getTime());

  const e = ongoing[0];
  if (!e) return null;
  return {
    uid: e.uid,
    title: e.summary || i18n.t('calendar.noTitle'),
    startIso: e.dtstart.toISOString(),
    endIso: e.dtend.toISOString(),
    color: e.color,
    link: eventDeepLink(e.uid),
    location: displayLocation(e.location),
    attendees: e.attendees.map((a) => a.displayName || a.email).filter(Boolean),
  };
}

export function shouldClearLiveEvent(
  current: LiveEventState | null,
  eventCount: number,
  now: Date = new Date(),
): boolean {
  if (!current) return false;
  if (new Date(current.endIso).getTime() <= now.getTime()) return true;
  return eventCount > 0;
}

export function eventProgress(state: LiveEventState, now: Date = new Date()): number {
  const start = new Date(state.startIso).getTime();
  const end = new Date(state.endIso).getTime();
  if (end <= start) return 1;
  const p = (now.getTime() - start) / (end - start);
  return Math.min(1, Math.max(0, p));
}

export function remainingMinutes(state: LiveEventState, now: Date = new Date()): number {
  const end = new Date(state.endIso).getTime();
  return Math.max(0, Math.round((end - now.getTime()) / 60000));
}

export interface DurationUnits {
  hour: string;
  minute: string;
}

export const DEFAULT_DURATION_UNITS: DurationUnits = { hour: 'h', minute: 'm' };

export function formatRemaining(minutes: number, units: DurationUnits = DEFAULT_DURATION_UNITS): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}${units.minute}`;
  if (m === 0) return `${h}${units.hour}`;
  return `${h}${units.hour}${String(m).padStart(2, '0')}`;
}
