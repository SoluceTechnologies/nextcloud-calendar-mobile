import type { Account, CalendarMeta, CalendarEvent } from '@/types';
import { parseIcsObjects } from '@/utils/caldav-parse';

function basicAuth(account: Pick<Account, 'username' | 'appPassword'>): string {
  return 'Basic ' + btoa(`${account.username}:${account.appPassword}`);
}

function calUrl(account: Account, path = ''): string {
  return `${account.baseUrl}/remote.php/dav/calendars/${encodeURIComponent(account.davUserId)}/${path}`;
}

function extractSlug(url: string): string {
  return url.replace(/\/$/, '').split('/').pop() ?? '';
}

function xmlText(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<[^>]*:?${tag}[^>]*>([^<]*)<`));
  return m?.[1]?.trim() ?? '';
}

function xmlAttr(xml: string, attr: string): string {
  const m = xml.match(new RegExp(`${attr}="([^"]*)"`));
  return m?.[1] ?? '';
}

// Split a PROPFIND/REPORT multistatus body into per-response chunks
function splitResponses(xml: string): string[] {
  const chunks: string[] = [];
  const re = /<d:response[^>]*>([\s\S]*?)<\/d:response>/g;
  let m;
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
  const url = `${params.baseUrl}/remote.php/dav/principals/users/${encodeURIComponent(params.username)}/`;
  const res = await davFetch(url, params, {
    method: 'PROPFIND',
    headers: { Depth: '0', 'Content-Type': 'application/xml' },
  });
  if (res.status === 401) throw new Error('401 auth failed');
  if (res.status !== 207 && !res.ok) throw new Error(`HTTP ${res.status}`);
  return { davUserId: params.username };
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
    <nc:calendar-color/>
    <ical:calendar-color/>
    <cs:getctag/>
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

    if (!chunk.includes('calendar/></d:resourcetype>') && !chunk.includes(':calendar/>')) continue;

    if (chunk.includes('deleted-calendar') || chunk.includes('trash')) continue;

    const hrefMatch = chunk.match(/<d:href>([^<]+)<\/d:href>/);
    if (!hrefMatch) continue;
    const path = hrefMatch[1];
    const calFullUrl = `${account.baseUrl}${path}`;
    const slug = extractSlug(path);

    const displayNameMatch = chunk.match(/<d:displayname>([^<]*)<\/d:displayname>/);
    const displayName = displayNameMatch?.[1]?.trim() || slug;

    const colorMatch = chunk.match(/<\w+:calendar-color[^>]*>([^<]+)<\/\w+:calendar-color>/);
    const rawColor = colorMatch?.[1]?.trim() || '';
    const color = rawColor.startsWith('#') ? rawColor.slice(0, 7) : '#1976d2';

    const ctagMatch = chunk.match(/<cs:getctag>([^<]*)<\/cs:getctag>/);
    const ctag = ctagMatch?.[1]?.trim() || '';

    calendars.push({
      id: calFullUrl,
      accountId: account.id,
      displayName,
      color,
      ctag,
      url: calFullUrl,
      slug,
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
    const dataMatch = chunk.match(/<cal:calendar-data[^>]*>([\s\S]*?)<\/cal:calendar-data>/);
    if (dataMatch?.[1] && hrefMatch?.[1]) {
      const href = `${account.baseUrl}${hrefMatch[1]}`;
      items.push({ ics: dataMatch[1].trim(), href });
    }
  }
  return parseIcsObjects(items, {
    calendarId: calendar.id,
    accountId: account.id,
    color: calendar.color,
  });
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
    throw new Error(`putEvent HTTP ${res.status}`);
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
    throw new Error(`updateEvent HTTP ${res.status}`);
  }
}

export async function deleteEvent(
  account: Account,
  href: string
): Promise<void> {
  console.log('[deleteEvent] DELETE', href);
  const res = await davFetch(href, account, { method: 'DELETE' });
  console.log('[deleteEvent] status:', res.status);
  if (!res.ok && res.status !== 404) throw new Error(`deleteEvent HTTP ${res.status}`);
}
