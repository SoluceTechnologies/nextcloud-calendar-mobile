import ICAL from 'ical.js';

import type { Account, CalendarInvitation, CalendarMeta, InvitationResponse } from '@/types';
import { parseIcsToJcal, resolveInstant, extractDtstartTzid } from '@/utils/caldav-parse';
import { davFetch, splitResponses, decodeXmlEntities } from './caldav';

function uidQueryBody(uid: string): string {
  return `<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:prop-filter name="UID">
          <C:text-match collation="i;octet">${uid.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</C:text-match>
        </C:prop-filter>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;
}

async function findExistingEventHref(
  account: Account,
  calendar: CalendarMeta,
  uid: string,
): Promise<string | undefined> {
  const res = await davFetch(calendar.url, account, {
    method: 'REPORT',
    headers: { Depth: '1', 'Content-Type': 'application/xml' },
    body: uidQueryBody(uid),
  });
  if (!res.ok && res.status !== 207) return undefined;
  const xml = await res.text();
  for (const chunk of splitResponses(xml)) {
    const hrefMatch = chunk.match(/<d:href>([^<]+)<\/d:href>/);
    if (hrefMatch?.[1] && !hrefMatch[1].replace(/\/$/, '').endsWith(calendar.url.replace(/\/$/, '').split('/').pop() ?? '')) {
      return absUrl(account, hrefMatch[1]);
    }
  }
  return undefined;
}

function inboxUrl(account: Account): string {
  return `${account.baseUrl}/remote.php/dav/calendars/${encodeURIComponent(account.davUserId)}/inbox/`;
}

function absUrl(account: Pick<Account, 'baseUrl'>, pathOrHref: string): string {
  return /^https?:\/\//i.test(pathOrHref) ? pathOrHref : new URL(pathOrHref, account.baseUrl).href;
}

function calendarQueryBody(): string {
  return `<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR"/>
  </C:filter>
</C:calendar-query>`;
}

function organizerNameOf(vevent: ICAL.Component): string | undefined {
  const prop = vevent.getFirstProperty('organizer');
  if (!prop) return undefined;
  const cn = prop.getParameter('cn');
  if (typeof cn === 'string' && cn) return cn;
  const value = prop.getFirstValue() as string | null;
  if (!value) return undefined;
  return value.replace(/^mailto:/i, '');
}

function findTargetAttendee(
  vevent: ICAL.Component,
  account: Account,
): { email: string; displayName?: string } | undefined {
  const props = vevent.getAllProperties('attendee');
  const accountEmail = account.email?.toLowerCase();
  const accountUsername = account.username.toLowerCase();

  for (const prop of props) {
    const value = (prop.getFirstValue() as string | null) ?? '';
    const email = value.replace(/^mailto:/i, '').toLowerCase();
    const partstat = (prop.getParameter('partstat') as string | undefined)?.toLowerCase() ?? '';
    if (!email) continue;

    const isMatch = accountEmail
      ? email === accountEmail
      : email.startsWith(`${accountUsername}@`) || email === accountUsername;

    if (isMatch || partstat === 'needs-action') {
      const displayName = (prop.getParameter('cn') as string | undefined) ?? undefined;
      return { email: value.replace(/^mailto:/i, ''), displayName };
    }
  }
  return undefined;
}

function partstatOf(vevent: ICAL.Component, targetEmail: string): string {
  const props = vevent.getAllProperties('attendee');
  const needle = targetEmail.toLowerCase();
  for (const prop of props) {
    const value = (prop.getFirstValue() as string | null) ?? '';
    const email = value.replace(/^mailto:/i, '').toLowerCase();
    if (email === needle) {
      return (prop.getParameter('partstat') as string | undefined) ?? 'needs-action';
    }
  }
  return 'needs-action';
}

function normalizePartstat(raw: string): CalendarInvitation['partstat'] {
  switch (raw.toLowerCase()) {
    case 'accepted':
      return 'accepted';
    case 'declined':
      return 'declined';
    case 'tentative':
      return 'tentative';
    default:
      return 'needs-action';
  }
}

function eventTzid(vevent: ICAL.Component): string | undefined {
  const raw = vevent.getFirstProperty('dtstart')?.getParameter('tzid');
  return typeof raw === 'string' && raw ? raw : undefined;
}

function talkUrlOf(location: string | undefined): string | undefined {
  if (!location) return undefined;
  return /\/call\//.test(location) ? location : undefined;
}

export function parseInvitation(
  item: { ics: string; href: string },
  account: Account,
): CalendarInvitation | undefined {
  const { ics, href } = item;
  try {
    const jcal = parseIcsToJcal(ics);
    const comp = new ICAL.Component(jcal);
    const method = (comp.getFirstPropertyValue('method') as string | undefined) ?? '';

    const vevents = comp.getAllSubcomponents('vevent');
    const master = vevents.find((v: ICAL.Component) => !v.getFirstPropertyValue('recurrence-id'));
    const vevent = master ?? vevents[0];
    if (!vevent) return undefined;

    const targetAttendee = findTargetAttendee(vevent, account);
    if (!targetAttendee) return undefined;

    const rawPartstat = partstatOf(vevent, targetAttendee.email);
    const partstat = normalizePartstat(rawPartstat);
    if (method.toUpperCase() !== 'REQUEST') {
      return undefined;
    }

    const icalEvent = new ICAL.Event(vevent, { strictExceptions: false });
    const tzid = eventTzid(vevent);

    const location = icalEvent.location ?? undefined;
    const rruleProp = vevent.getFirstProperty('rrule');
    const isRecurring = !!rruleProp;
    const rruleStr: string | undefined = rruleProp ? rruleProp.toICALString() : undefined;

    return {
      uid: icalEvent.uid,
      href,
      accountId: account.id,
      summary: icalEvent.summary,
      description: icalEvent.description ?? undefined,
      location,
      dtstart: resolveInstant(icalEvent.startDate, tzid),
      dtend: resolveInstant(icalEvent.endDate, tzid, true),
      allDay: icalEvent.startDate.isDate,
      organizerEmail: (() => {
        const prop = vevent.getFirstProperty('organizer');
        if (!prop) return undefined;
        const value = prop.getFirstValue() as string | null;
        return value ? value.replace(/^mailto:/i, '') : undefined;
      })(),
      organizerName: organizerNameOf(vevent),
      attendeeEmail: targetAttendee.email,
      attendeeDisplayName: targetAttendee.displayName,
      partstat,
      method: method.toUpperCase(),
      ics,
      talkUrl: talkUrlOf(location),
      isRecurring,
      rrule: rruleStr,
      timezone: extractDtstartTzid(ics),
    };
  } catch (error) {
    console.warn('[parseInvitation] failed to parse ICS:', error);
    return undefined;
  }
}

export async function fetchInvitations(account: Account): Promise<CalendarInvitation[]> {
  const res = await davFetch(inboxUrl(account), account, {
    method: 'REPORT',
    headers: { Depth: '1', 'Content-Type': 'application/xml' },
    body: calendarQueryBody(),
  });
  if (res.status !== 207) {
    throw new Error(`fetchInvitations HTTP ${res.status}`);
  }
  const xml = await res.text();

  const items: { ics: string; href: string }[] = [];
  for (const chunk of splitResponses(xml)) {
    const hrefMatch = chunk.match(/<d:href>([^<]+)<\/d:href>/);
    const dataMatch = chunk.match(/<cal:calendar-data[^>]*>([\s\S]*?)<\/cal:calendar-data>/);
    if (dataMatch?.[1] && hrefMatch?.[1]) {
      const href = absUrl(account, hrefMatch[1]);
      items.push({ ics: decodeXmlEntities(dataMatch[1].trim()), href });
    }
  }

  const out: CalendarInvitation[] = [];
  for (const item of items) {
    const parsed = parseInvitation(item, account);
    if (parsed) out.push(parsed);
  }
  return out;
}

function masterVevent(comp: ICAL.Component): ICAL.Component | undefined {
  const vevents = comp.getAllSubcomponents('vevent');
  return vevents.find((v: ICAL.Component) => !v.getFirstPropertyValue('recurrence-id')) ?? vevents[0];
}

function updateAttendeePartstat(vevent: ICAL.Component, targetEmail: string, response: InvitationResponse): void {
  const props = vevent.getAllProperties('attendee');
  const needle = targetEmail.toLowerCase();
  for (const prop of props) {
    const value = (prop.getFirstValue() as string | null) ?? '';
    const email = value.replace(/^mailto:/i, '').toLowerCase();
    if (email === needle) {
      prop.setParameter('partstat', response.toUpperCase());
      prop.setParameter('rsvp', 'FALSE');
    }
  }
}

function removeMethod(comp: ICAL.Component): void {
  const method = comp.getFirstProperty('method');
  if (method) comp.removeProperty(method);
}

function setMethod(comp: ICAL.Component, method: string): void {
  const existing = comp.getFirstProperty('method');
  if (existing) {
    existing.setValue(method);
  } else {
    comp.addPropertyWithValue('method', method);
  }
}

function updateDtstamp(vevent: ICAL.Component): void {
  const now = ICAL.Time.now();
  const dtstamp = vevent.getFirstProperty('dtstamp');
  if (dtstamp) {
    dtstamp.setValue(now);
  } else {
    vevent.addPropertyWithValue('dtstamp', now);
  }
}

function updateProdid(comp: ICAL.Component): void {
  const prodid = comp.getFirstProperty('prodid');
  if (prodid) {
    prodid.setValue('-//Nextcloud Calendar Mobile//EN');
  } else {
    comp.addPropertyWithValue('prodid', '-//Nextcloud Calendar Mobile//EN');
  }
}

function buildAcceptedEventIcs(
  invitation: CalendarInvitation,
  response: InvitationResponse,
): string {
  const jcal = parseIcsToJcal(invitation.ics);
  const comp = new ICAL.Component(jcal);
  const vevent = masterVevent(comp);
  if (!vevent) throw new Error('No VEVENT found in invitation');

  removeMethod(comp);
  updateAttendeePartstat(vevent, invitation.attendeeEmail, response);
  updateDtstamp(vevent);
  updateProdid(comp);

  return ICAL.stringify(comp.jCal);
}

function buildReplyIcs(
  invitation: CalendarInvitation,
  response: InvitationResponse,
): string {
  const jcal = parseIcsToJcal(invitation.ics);
  const comp = new ICAL.Component(jcal);
  const vevent = masterVevent(comp);
  if (!vevent) throw new Error('No VEVENT found in invitation');

  setMethod(comp, 'REPLY');
  updateAttendeePartstat(vevent, invitation.attendeeEmail, response);
  updateDtstamp(vevent);
  updateProdid(comp);

  return ICAL.stringify(comp.jCal);
}

export async function respondToInvitation(
  account: Account,
  invitation: CalendarInvitation,
  response: InvitationResponse,
  targetCalendar: CalendarMeta,
): Promise<void> {
  if (response === 'declined') {
    const replyIcs = buildReplyIcs(invitation, response);
    const outboxUrl = `${account.baseUrl}/remote.php/dav/calendars/${encodeURIComponent(account.davUserId)}/outbox/`;
    const postRes = await davFetch(outboxUrl, account, {
      method: 'POST',
      headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
      body: replyIcs,
    });
    if (!postRes.ok && postRes.status !== 403 && postRes.status !== 404) {
      console.warn(`[respondToInvitation] outbox POST HTTP ${postRes.status}`);
    }
    await davFetch(invitation.href, account, { method: 'DELETE' });
    return;
  }

  const eventIcs = buildAcceptedEventIcs(invitation, response);
  const existingHref = await findExistingEventHref(account, targetCalendar, invitation.uid);
  const url = existingHref ?? `${targetCalendar.url}${encodeURIComponent(invitation.uid)}.ics`;
  const putRes = await davFetch(url, account, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
    body: eventIcs,
  });
  if (!putRes.ok) {
    throw new Error(`respondToInvitation PUT HTTP ${putRes.status}`);
  }

  const replyIcs = buildReplyIcs(invitation, response);
  const outboxUrl = `${account.baseUrl}/remote.php/dav/calendars/${encodeURIComponent(account.davUserId)}/outbox/`;
  const postRes = await davFetch(outboxUrl, account, {
    method: 'POST',
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
    body: replyIcs,
  });
  if (!postRes.ok && postRes.status !== 403 && postRes.status !== 404) {
    console.warn(`[respondToInvitation] outbox POST HTTP ${postRes.status}`);
  }

  await davFetch(invitation.href, account, { method: 'DELETE' });
}

export async function deleteInvitation(account: Account, href: string): Promise<void> {
  const res = await davFetch(href, account, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    throw new Error(`deleteInvitation HTTP ${res.status}`);
  }
}
