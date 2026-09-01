import type { Account, Attendee, AttendeeAvailability } from '@/types';
import { utcStamp } from '@/utils/ics';
import { parseVFreeBusy } from '@/utils/freeBusy';
import { attendeeColor } from '@/utils/attendees';
import { trustedFetch } from '../shared/trustedFetch';

function basicAuth(account: Pick<Account, 'username' | 'appPassword'>): string {
  return 'Basic ' + btoa(`${account.username}:${account.appPassword}`);
}

/**
 * Derive the CalDAV scheduling outbox URL for an account.
 *
 * Per RFC 6638 the outbox lives at the calendar-home-set root with a trailing
 * `outbox/` segment. Nextcloud uses `/remote.php/dav/calendars/<davUserId>/outbox/`.
 */
export function schedulingOutboxUrl(account: Account): string {
  return `${account.baseUrl}/remote.php/dav/calendars/${encodeURIComponent(account.davUserId)}/outbox/`;
}

/**
 * Build a VFREEBUSY REQUEST iCalendar payload to POST to the scheduling outbox.
 *
 * The window is expanded to full-day boundaries to work around a known
 * Nextcloud server bug (#61191) that returns spurious BUSY-UNAVAILABLE periods
 * for sub-day query windows when working hours are configured.
 */
export function buildFreeBusyIcs(
  start: Date,
  end: Date,
  organizer: Attendee,
  attendees: Attendee[],
): string {
  // Expand to full-day UTC boundaries to avoid the #61191 bug.
  const dayStart = new Date(start);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(end);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}@nextcloud-calendar-mobile`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nextcloud Calendar Mobile//EN',
    'METHOD:REQUEST',
    'BEGIN:VFREEBUSY',
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(dayStart)}`,
    `DTEND:${utcStamp(dayEnd)}`,
    `ORGANIZER${organizer.displayName ? `;CN=${organizer.displayName}` : ''}:mailto:${organizer.email}`,
    ...attendees.map((a) => {
      const cn = a.displayName ? `;CN=${a.displayName}` : '';
      return `ATTENDEE${cn}:mailto:${a.email}`;
    }),
    'END:VFREEBUSY',
    'END:VCALENDAR',
  ];
  return lines.map((l) => l + '\r\n').join('');
}

interface ScheduleResponseEntry {
  href: string;
  status: string;
  calendarData?: string;
}

/**
 * Parse a CalDAV `schedule-response` XML document and extract per-attendee
 * results. Each `<cal:response>` contains a `recipient` href, a `request-status`
 * and an optional `calendar-data` with the VFREEBUSY reply.
 */
function parseScheduleResponse(xml: string): ScheduleResponseEntry[] {
  const entries: ScheduleResponseEntry[] = [];
  const responseRe = /<(?:cal|cs|d):response[^>]*>([\s\S]*?)<\/(?:cal|cs|d):response>/gi;
  let m: RegExpExecArray | null;
  while ((m = responseRe.exec(xml)) !== null) {
    const block = m[1];

    const hrefMatch = block.match(/<(?:cal|cs|d):recipient[^>]*>(?:[\s\S]*?<(?:d:)?href[^>]*>([^<]+)<\/(?:d:)?href>)?[\s\S]*?<\/(?:cal|cs|d):recipient>/i);
    const href = hrefMatch?.[1]?.trim() ?? '';

    const statusMatch = block.match(/<(?:cal|cs|d):request-status[^>]*>([^<]+)<\/(?:cal|cs|d):request-status>/i);
    const status = statusMatch?.[1]?.trim() ?? '';

    const calDataMatch = block.match(/<(?:cal|cs|d):calendar-data[^>]*>([\s\S]*?)<\/(?:cal|cs|d):calendar-data>/i);
    const calendarData = calDataMatch?.[1]?.trim();

    entries.push({ href, status, calendarData });
  }
  return entries;
}

function stripMailto(value: string): string {
  return value.replace(/^mailto:/i, '').trim();
}

/**
 * Fetch free/busy information for a list of attendees via the CalDAV
 * scheduling outbox (RFC 6638).
 *
 * Returns one `AttendeeAvailability` per attendee. Attendees for which the
 * server returns an error (e.g. external users not on the instance) get
 * `available: false` with an empty slots array.
 */
export async function fetchFreeBusy(
  account: Account,
  organizer: Attendee,
  attendees: Attendee[],
  start: Date,
  end: Date,
): Promise<AttendeeAvailability[]> {
  if (attendees.length === 0) return [];

  const url = schedulingOutboxUrl(account);
  const ics = buildFreeBusyIcs(start, end, organizer, attendees);

  const res = await trustedFetch(url, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(account),
      'Content-Type': 'text/calendar; charset=utf-8',
      Depth: '0',
    },
    body: ics,
    maxRetries: 1,
  });

  if (!res.ok && res.status !== 207) {
    throw new Error(`fetchFreeBusy HTTP ${res.status}`);
  }

  const xml = await res.text();
  const entries = parseScheduleResponse(xml);

  // Build a lookup by email for quick matching.
  const byEmail = new Map<string, AttendeeAvailability>();
  for (const att of attendees) {
    byEmail.set(att.email.toLowerCase(), {
      email: att.email,
      displayName: att.displayName,
      slots: [],
      available: false,
      color: attendeeColor(att.email),
    });
  }

  for (const entry of entries) {
    const email = stripMailto(entry.href).toLowerCase();
    const avail = byEmail.get(email);
    if (!avail) continue;

    // request-status format: "2.0;Success" or "3.7;Could not find principal"
    const statusOk = /^2\.\d/.test(entry.status);
    if (!statusOk || !entry.calendarData) {
      avail.available = false;
      continue;
    }

    // Tag each parsed slot with the attendee it belongs to.
    avail.slots = parseVFreeBusy(entry.calendarData).map((slot) => ({
      ...slot,
      attendees: [avail.email],
    }));
    avail.available = true;
  }

  return attendees.map((a) => byEmail.get(a.email.toLowerCase())!);
}
