import type { Account, CalendarMeta, CalendarEvent } from '@/types';
import { parseIcsObjectsAsync } from '@/utils/caldav-parse';
import { settleAllOrThrow } from '@/utils/settle';
import { httpErrorFrom } from '../shared/errors';

function basicAuth(account: Pick<Account, 'username' | 'appPassword'>): string {
  return 'Basic ' + btoa(`${account.username}:${account.appPassword}`);
}

function calUrl(account: Account, path = ''): string {
  return `${account.baseUrl}/remote.php/dav/calendars/${encodeURIComponent(account.davUserId)}/${path}`;
}

function absUrl(account: Pick<Account, 'baseUrl'>, pathOrHref: string): string {
  return /^https?:\/\//i.test(pathOrHref) ? pathOrHref : new URL(pathOrHref, account.baseUrl).href;
}

function extractSlug(url: string): string {
  const slug = url.replace(/\/$/, '').split('/').pop() ?? '';
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

const NAMED_XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

export function decodeXmlEntities(input: string): string {
  return input.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_XML_ENTITIES[entity] ?? match;
  });
}

function extractPropHref(xml: string, localName: string): string | undefined {
  const prop = new RegExp(
    `<[A-Za-z0-9_.-]*:?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)</[A-Za-z0-9_.-]*:?${localName}\\s*>`,
    'i',
  ).exec(xml)?.[1];
  const href = prop && /<[A-Za-z0-9_.-]*:?href(?:\s[^>]*)?>([\s\S]*?)</i.exec(prop)?.[1];
  return href ? decodeXmlEntities(href).trim() : undefined;
}

function splitResponses(xml: string): string[] {
  const chunks: string[] = [];
  const re = /<d:response[^>]*>([\s\S]*?)<\/d:response>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) chunks.push(m[0]);
  return chunks;
}

async function davFetch(
  url: string,
  account: Pick<Account, 'username' | 'appPassword'>,
  options: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      ...options,
      credentials: 'omit',
      headers: {
        Authorization: basicAuth(account),
        ...options.headers,
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

export async function validateCredentials(params: {
  baseUrl: string;
  username: string;
  appPassword: string;
}): Promise<{ davUserId: string }> {
  const res = await davFetch(`${params.baseUrl}/remote.php/dav/`, params, {
    method: 'PROPFIND',
    headers: { Depth: '0', 'Content-Type': 'application/xml' },
    body: '<?xml version="1.0" encoding="utf-8"?>' +
    '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>',
  });
  if (res.status !== 207 && !res.ok) throw httpErrorFrom(res, 'validateCredentials');

  const principalPath = extractPropHref(await res.text(), 'current-user-principal');

  if (!principalPath) {
    const principalUrl = `${params.baseUrl}/remote.php/dav/principals/users/${encodeURIComponent(params.username)}/`;
    const fallback = await davFetch(principalUrl, params, { method: 'PROPFIND', headers: { Depth: '0', 'Content-Type': 'application/xml' } });
    if (fallback.status !== 207 && !fallback.ok) throw httpErrorFrom(fallback, 'validateCredentials');
    return { davUserId: params.username };
  }

  const principalUrl = new URL(principalPath, new URL(params.baseUrl).origin).toString();
  const homeRes = await davFetch(principalUrl, params, {
    method: 'PROPFIND',
    headers: { Depth: '0', 'Content-Type': 'application/xml' },
    body: '<?xml version="1.0" encoding="utf-8"?>' +
    '<d:propfind xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav"><d:prop><cal:calendar-home-set/></d:prop></d:propfind>',
  });
  if (homeRes.status !== 207 && !homeRes.ok) {
    return { davUserId: extractSlug(principalPath) || params.username };
  }

  const homePath = extractPropHref(await homeRes.text(), 'calendar-home-set');
  return { davUserId: extractSlug(homePath ?? principalPath) || params.username };
}

export interface SyncCollectionResult {
  changed: string[];
  deleted: string[];
  newToken: string;
  reset: boolean;
}

export async function syncCollection(
  account: Account,
  calendar: CalendarMeta,
  token?: string,
): Promise<SyncCollectionResult> {
  const body = `<?xml version="1.0"?>
<d:sync-collection xmlns:d="DAV:">
  <d:sync-token>${token ?? ''}</d:sync-token>
  <d:sync-level>1</d:sync-level>
  <d:prop><d:getetag/></d:prop>
</d:sync-collection>`;

  const res = await davFetch(calendar.url, account, {
    method: 'REPORT',
    headers: { Depth: '1', 'Content-Type': 'application/xml' },
    body,
  });

  if (res.status === 507 || res.status === 403 || res.status === 409) {
    return { changed: [], deleted: [], newToken: '', reset: true };
  }
  if (res.status !== 207) throw new Error(`syncCollection HTTP ${res.status}`);

  const xml = await res.text();
  const changed: string[] = [];
  const deleted: string[] = [];

  for (const chunk of splitResponses(xml)) {
    const hrefMatch = chunk.match(/<d:href>([^<]+)<\/d:href>/);
    if (!hrefMatch) continue;
    const abs = absUrl(account, hrefMatch[1]);
    if (/<d:status>[^<]*\b404\b/.test(chunk)) deleted.push(abs);
    else changed.push(abs);
  }

  const tokenMatch = xml.match(/<d:sync-token>([^<]*)<\/d:sync-token>/);
  return { changed, deleted, newToken: tokenMatch?.[1]?.trim() ?? '', reset: false };
}

export async function fetchCalendars(account: Account): Promise<CalendarMeta[]> {
  const url = calUrl(account);
  const body = `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/"
            xmlns:c="urn:ietf:params:xml:ns:caldav"
            xmlns:nc="http://nextcloud.org/ns"
            xmlns:ical="http://apple.com/ns/ical/">
  <d:prop>
    <d:resourcetype/>
    <d:displayname/>
    <d:current-user-privilege-set/>
    <nc:calendar-color/>
    <ical:calendar-color/>
    <cs:getctag/>
    <cs:source/>
  </d:prop>
</d:propfind>`;

  const res = await davFetch(url, account, {
    method: 'PROPFIND',
    headers: { Depth: '1', 'Content-Type': 'application/xml' },
    body,
  });
  if (res.status !== 207) throw new Error(`fetchCalendars HTTP ${res.status}`);
  const xml = await res.text();

  const calendars: CalendarMeta[] = [];
  for (const chunk of splitResponses(xml)) {
    const isCalendar = chunk.includes(':calendar/>') || chunk.includes('calendar/></d:resourcetype>');
    const isSubscribed = chunk.includes(':subscribed-calendar/>') || chunk.includes('subscribed');
    if (!isCalendar && !isSubscribed) continue;

    if (chunk.includes('deleted-calendar') || chunk.includes('trash')) continue;

    const hrefMatch = chunk.match(/<d:href>([^<]+)<\/d:href>/);
    if (!hrefMatch) continue;
    const path = hrefMatch[1];
    const calFullUrl = absUrl(account, path);
    const slug = extractSlug(path);

    const displayNameMatch = chunk.match(/<d:displayname>([^<]*)<\/d:displayname>/);
    const displayName = decodeXmlEntities(displayNameMatch?.[1] ?? '').trim() || slug;

    const colorMatch = chunk.match(/<\w+:calendar-color[^>]*>([^<]+)<\/\w+:calendar-color>/);
    const rawColor = colorMatch?.[1]?.trim() || '';
    const color = rawColor.startsWith('#') ? rawColor.slice(0, 7) : '#1976d2';

    const ctagMatch = chunk.match(/<cs:getctag>([^<]*)<\/cs:getctag>/);
    const ctag = ctagMatch?.[1]?.trim() || '';

    const sourceMatch = chunk.match(/<cs:source[^>]*>[\s\S]*?<d:href>([^<]+)<\/d:href>[\s\S]*?<\/cs:source>/);
    const sourceUrl = sourceMatch ? decodeXmlEntities(sourceMatch[1]).trim() : undefined;

    const hasPrivilegeSet = chunk.includes('current-user-privilege-set');
    const hasAll = chunk.includes('<d:all');
    const hasWrite = chunk.includes('<d:write') || chunk.includes('<d:write/>');
    const hasBind = chunk.includes('<d:bind') || chunk.includes('<d:bind/>');
    const isReadOnly = hasPrivilegeSet && !hasAll && !hasWrite && !hasBind;

    calendars.push({
      id: calFullUrl,
      accountId: account.id,
      displayName,
      color,
      ctag,
      url: calFullUrl,
      slug,
      isSubscribed: isSubscribed && !isCalendar,
      isReadOnly,
      sourceUrl,
    });
  }
  return calendars;
}

export async function fetchEvents(
  account: Account,
  calendar: CalendarMeta,
  start: Date,
  end: Date
): Promise<CalendarEvent[]> {
  const body = `<?xml version="1.0"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${start.toISOString().replace(/[-:]/g, '').split('.')[0]}Z"
                      end="${end.toISOString().replace(/[-:]/g, '').split('.')[0]}Z"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

  if (calendar.isSubscribed && calendar.sourceUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let icsText: string;
    try {
      const r = await fetch(calendar.sourceUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error(`fetchSubscribed HTTP ${r.status}`);
      icsText = await r.text();
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
    const parsed = await parseIcsObjectsAsync(
      [{ ics: icsText, href: calendar.sourceUrl }],
      { calendarId: calendar.id, accountId: account.id, color: calendar.color },
      start, end,
    );
    return parsed.filter((e) => e.dtend > start && e.dtstart < end);
  }

  const res = await davFetch(calendar.url, account, {
    method: 'REPORT',
    headers: { Depth: '1', 'Content-Type': 'application/xml' },
    body,
  });
  if (res.status !== 207) throw new Error(`fetchEvents HTTP ${res.status}`);
  const xml = await res.text();

  const items: { ics: string; href: string }[] = [];
  for (const chunk of splitResponses(xml)) {
    const hrefMatch = chunk.match(/<d:href>([^<]+)<\/d:href>/);
    // Match calendar-data regardless of namespace prefix (cal:, c:, s:, etc.)
    const dataMatch = chunk.match(/<[\w]+:calendar-data[^>]*>([\s\S]*?)<\/[\w]+:calendar-data>/);
    if (dataMatch?.[1] && hrefMatch?.[1]) {
      const href = absUrl(account, hrefMatch[1]);
      items.push({ ics: decodeXmlEntities(dataMatch[1].trim()), href });
    }
  }

  const parsed = await parseIcsObjectsAsync(items, {
    calendarId: calendar.id,
    accountId: account.id,
    color: calendar.color,
  }, start, end);

  if (items.length > 0 && parsed.length === 0) {
    console.warn(
      `[fetchEvents] ${calendar.slug}: extracted ${items.length} ICS items but parsed 0 events`,
    );
  }

  return parsed;
}

export function fetchEventsForCalendars(
  account: Account,
  calendars: CalendarMeta[],
  start: Date,
  end: Date,
): Promise<CalendarEvent[]> {
  return settleAllOrThrow(
    calendars.map((cal) => () => fetchEvents(account, cal, start, end)),
  );
}

export async function fetchEventIcs(account: Account, href: string): Promise<string> {
  const res = await davFetch(href, account, {
    method: 'GET',
    headers: { Accept: 'text/calendar' },
  });
  if (!res.ok) throw new Error(`fetchEventIcs HTTP ${res.status}`);
  return res.text();
}

export async function putEvent(
  account: Account,
  calendar: CalendarMeta,
  uid: string,
  ics: string
): Promise<void> {
  const url = `${calendar.url}${uid}.ics`;
  const res = await davFetch(url, account, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
    body: ics,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[putEvent] error body:', body.slice(0, 300));
    throw httpErrorFrom(res, 'putEvent');
  }
}

export async function updateEvent(
  account: Account,
  href: string,
  ics: string
): Promise<void> {
  const res = await davFetch(href, account, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
    body: ics,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[updateEvent] error body:', body.slice(0, 300));
    throw httpErrorFrom(res, 'updateEvent');
  }
}

export async function moveEvent(
  account: Account,
  fromHref: string,
  targetCalendar: CalendarMeta,
  uid: string
): Promise<void> {
  const destination = `${targetCalendar.url}${uid}.ics`;
  const res = await davFetch(fromHref, account, {
    method: 'MOVE',
    headers: { Destination: destination, Overwrite: 'T' },
  });
  if (!res.ok && res.status !== 201 && res.status !== 204) {
    const body = await res.text().catch(() => '');
    console.error('[moveEvent] error body:', body.slice(0, 300));
    throw httpErrorFrom(res, 'moveEvent');
  }
}

export async function deleteEvent(
  account: Account,
  href: string
): Promise<void> {
  const res = await davFetch(href, account, { method: 'DELETE' });
  if (res.status === 404) console.warn('[deleteEvent] 404, nothing deleted at', href);
  if (!res.ok && res.status !== 404) throw httpErrorFrom(res, 'deleteEvent');
}

export const MULTIGET_BATCH = 50;

function toPath(account: Account, absHref: string): string {
  return absHref.startsWith(account.baseUrl) ? absHref.slice(account.baseUrl.length) : absHref;
}

export async function fetchEventsByHrefs(
  account: Account,
  calendar: CalendarMeta,
  hrefs: string[],
  rangeStart: Date,
  rangeEnd: Date,
): Promise<CalendarEvent[]> {
  if (hrefs.length === 0) return [];

  const out: CalendarEvent[] = [];
  for (let i = 0; i < hrefs.length; i += MULTIGET_BATCH) {
    const batch = hrefs.slice(i, i + MULTIGET_BATCH);
    const hrefEls = batch.map((h) => `<d:href>${toPath(account, h)}</d:href>`).join('');
    const body = `<?xml version="1.0"?>
<c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  ${hrefEls}
</c:calendar-multiget>`;

    const res = await davFetch(calendar.url, account, {
      method: 'REPORT',
      headers: { Depth: '1', 'Content-Type': 'application/xml' },
      body,
    });
    if (res.status !== 207) throw new Error(`fetchEventsByHrefs HTTP ${res.status}`);
    const xml = await res.text();

    const items: { ics: string; href: string }[] = [];
    for (const chunk of splitResponses(xml)) {
      const hrefMatch = chunk.match(/<d:href>([^<]+)<\/d:href>/);
      const dataMatch = chunk.match(/<cal:calendar-data[^>]*>([\s\S]*?)<\/cal:calendar-data>/);
      if (dataMatch?.[1] && hrefMatch?.[1]) {
        items.push({ ics: decodeXmlEntities(dataMatch[1].trim()), href: absUrl(account, hrefMatch[1]) });
      }
    }

    const parsed = await parseIcsObjectsAsync(
      items,
      { calendarId: calendar.id, accountId: account.id, color: calendar.color },
      rangeStart, rangeEnd,
    );
    out.push(...parsed);
  }
  return out;
}
