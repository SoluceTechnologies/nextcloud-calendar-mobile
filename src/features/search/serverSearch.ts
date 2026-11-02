import dayjs from 'dayjs';

import type { CalendarSearchEntry } from '@/services/nextcloud/search';
import { base64ToUtf8 } from '@/services/shared/base64';
import type { CalendarMeta } from '@/types';

import { foldText } from './matchEvent';
import type { DateTerm, SearchQuery } from './parseQuery';

export type ServerRequest = { term: string; since?: string; until?: string };
export type ServerHit = { title: string; subline: string; start: Date | null; href: string; calendar: CalendarMeta };

type Bounds = { since?: number; until?: number };

const MIN_TERM_LENGTH = 2;
const CALENDAR_PATH = '/remote.php/dav/calendars/';
const DEEP_LINK = /\/apps\/calendar\/edit\/([^?#]+)/;
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function safeDecode(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export function hrefPath(href: string): string {
  try {
    return safeDecode(new URL(href).pathname);
  } catch {
    return safeDecode(href);
  }
}

function withoutTrailingSlash(path: string): string {
  return path.endsWith('/') ? path.slice(0, -1) : path;
}

function dateBounds(term: DateTerm, now: number): Bounds | null {
  const today = dayjs(now);
  switch (term.value) {
    case 'today': return { since: today.startOf('day').valueOf(), until: today.endOf('day').valueOf() };
    case 'tomorrow': {
      const tomorrow = today.add(1, 'day');
      return { since: tomorrow.startOf('day').valueOf(), until: tomorrow.endOf('day').valueOf() };
    }
    case 'week': return { since: now, until: today.add(7, 'day').valueOf() };
    case 'month': return { since: now, until: today.add(1, 'month').valueOf() };
    case 'upcoming': return { since: now };
    case 'past': return { until: now };
  }
  const match = DAY_PATTERN.exec(term.value);
  if (!match) return null;
  const day = dayjs(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  switch (term.comparator) {
    case '<': return { until: day.startOf('day').valueOf() };
    case '<=': return { until: day.endOf('day').valueOf() };
    case '>': return { since: day.endOf('day').valueOf() };
    case '>=': return { since: day.startOf('day').valueOf() };
    default: return { since: day.startOf('day').valueOf(), until: day.endOf('day').valueOf() };
  }
}

export function serverRequest(query: SearchQuery, now: number): ServerRequest | null {
  if (query.title.length + query.location.length + query.description.length + query.attendee.length > 0) return null;
  const term = query.text.join(' ').trim();
  if (term.length < MIN_TERM_LENGTH) return null;
  const bounds: Bounds = {};
  for (const dateTerm of query.date) {
    const next = dateBounds(dateTerm, now);
    if (!next) return null;
    if (next.since !== undefined) bounds.since = Math.max(bounds.since ?? next.since, next.since);
    if (next.until !== undefined) bounds.until = Math.min(bounds.until ?? next.until, next.until);
  }
  const request: ServerRequest = { term };
  if (bounds.since !== undefined) request.since = new Date(bounds.since).toISOString();
  if (bounds.until !== undefined) request.until = new Date(bounds.until).toISOString();
  return request;
}

export function davPathFromResourceUrl(resourceUrl: string): string | null {
  const encoded = DEEP_LINK.exec(resourceUrl)?.[1];
  if (!encoded) return null;
  let path: string;
  try {
    path = base64ToUtf8(safeDecode(encoded));
  } catch {
    return null;
  }
  return path.startsWith('/') && path.includes(CALENDAR_PATH) ? path : null;
}

export function toServerHits(
  entries: CalendarSearchEntry[],
  context: {
    baseUrl: string;
    calendars: CalendarMeta[];
    hiddenCalendarIds: string[];
    knownHrefs: Set<string>;
    query: SearchQuery;
  },
): ServerHit[] {
  const origin = new URL(context.baseUrl).origin;
  const hidden = new Set(context.hiddenCalendarIds);
  const calendarByPath = new Map(
    context.calendars
      .filter((calendar) => !calendar.isSubscribed && !hidden.has(calendar.id))
      .map((calendar) => [withoutTrailingSlash(hrefPath(calendar.url)), calendar]),
  );
  const calendarNeedles = context.query.calendar.map(foldText);
  const hits: ServerHit[] = [];
  for (const entry of entries) {
    const davPath = davPathFromResourceUrl(entry.resourceUrl);
    if (!davPath) continue;
    const decodedPath = hrefPath(davPath);
    const calendar = calendarByPath.get(decodedPath.slice(0, decodedPath.lastIndexOf('/')));
    if (!calendar) continue;
    if (context.knownHrefs.has(decodedPath)) continue;
    const calendarName = foldText(calendar.displayName);
    if (!calendarNeedles.every((needle) => needle.length > 0 && calendarName.includes(needle))) continue;
    hits.push({
      title: entry.title,
      subline: entry.subline,
      start: entry.start,
      href: origin + encodeURI(decodedPath),
      calendar,
    });
  }
  return hits;
}
