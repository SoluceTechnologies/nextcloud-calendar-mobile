import { parseInvitation, fetchInvitations, respondToInvitation, updateAttendeeStatus } from '../../../src/services/nextcloud/invitations';
import type { Account, CalendarEvent, CalendarMeta } from '../../../src/types';

const account: Account = {
  id: 'acc-1',
  displayName: 'Bob',
  baseUrl: 'https://cloud.example.com',
  username: 'bob',
  appPassword: 'xxxx',
  davUserId: 'bob',
  email: 'bob@example.com',
};

const targetCalendar: CalendarMeta = {
  id: 'https://cloud.example.com/remote.php/dav/calendars/bob/personal/',
  accountId: 'acc-1',
  displayName: 'Personal',
  color: '#1976d2',
  ctag: '1',
  url: 'https://cloud.example.com/remote.php/dav/calendars/bob/personal/',
  slug: 'personal',
};

const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
});

function makeInvitationIcs(extra: string = ''): string {
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\nMETHOD:REQUEST\r\nBEGIN:VEVENT\r\nUID:invite-001\r\nDTSTAMP:20260827T120000Z\r\nSEQUENCE:0\r\nDTSTART;TZID=Europe/Paris:20260828T140000\r\nDTEND;TZID=Europe/Paris:20260828T150000\r\nSUMMARY:Team meeting\r\nORGANIZER;CN=Alice:mailto:alice@example.com\r\nATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;RSVP=TRUE;PARTSTAT=NEEDS-ACTION;CN=Bob:mailto:bob@example.com\r\n${extra}END:VEVENT\r\nEND:VCALENDAR`;
}

function makeCalendarEventIcs(extra: string = ''): string {
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\nBEGIN:VEVENT\r\nUID:invite-001\r\nDTSTAMP:20260827T120000Z\r\nSEQUENCE:1\r\nDTSTART;TZID=Europe/Paris:20260828T140000\r\nDTEND;TZID=Europe/Paris:20260828T150000\r\nSUMMARY:Team meeting\r\nORGANIZER;CN=Alice:mailto:alice@example.com\r\nATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;RSVP=FALSE;PARTSTAT=ACCEPTED;CN=Bob:mailto:bob@example.com\r\n${extra}END:VEVENT\r\nEND:VCALENDAR`;
}

const existingEvent: CalendarEvent = {
  uid: 'invite-001',
  href: 'https://cloud.example.com/remote.php/dav/calendars/bob/personal/invite-001.ics',
  calendarId: targetCalendar.id,
  accountId: account.id,
  summary: 'Team meeting',
  dtstart: new Date('2026-08-28T12:00:00.000Z'),
  dtend: new Date('2026-08-28T13:00:00.000Z'),
  allDay: false,
  color: targetCalendar.color,
  attendees: [{ email: 'bob@example.com', displayName: 'Bob', partstat: 'accepted' }],
  organizerEmail: 'alice@example.com',
  isRecurring: false,
};

describe('parseInvitation', () => {
  it('parses a REQUEST invitation and extracts the target attendee', () => {
    const invitation = parseInvitation({
      ics: makeInvitationIcs(),
      href: 'https://cloud.example.com/remote.php/dav/calendars/bob/inbox/invite-001.ics',
    }, account);

    expect(invitation).toBeDefined();
    expect(invitation?.uid).toBe('invite-001');
    expect(invitation?.summary).toBe('Team meeting');
    expect(invitation?.organizerEmail).toBe('alice@example.com');
    expect(invitation?.organizerName).toBe('Alice');
    expect(invitation?.attendeeEmail).toBe('bob@example.com');
    expect(invitation?.attendeeDisplayName).toBe('Bob');
    expect(invitation?.partstat).toBe('needs-action');
    expect(invitation?.method).toBe('REQUEST');
    expect(invitation?.timezone).toBe('Europe/Paris');
    expect(invitation?.dtstart).toEqual(new Date('2026-08-28T12:00:00.000Z'));
    expect(invitation?.dtend).toEqual(new Date('2026-08-28T13:00:00.000Z'));
  });

  it('returns undefined for a non-REQUEST message with no pending attendee', () => {
    const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\nMETHOD:REPLY\r\nBEGIN:VEVENT\r\nUID:invite-001\r\nDTSTAMP:20260827T120000Z\r\nSEQUENCE:0\r\nDTSTART;TZID=Europe/Paris:20260828T140000\r\nDTEND;TZID=Europe/Paris:20260828T150000\r\nSUMMARY:Team meeting\r\nORGANIZER;CN=Alice:mailto:alice@example.com\r\nATTENDEE;PARTSTAT=ACCEPTED:mailto:bob@example.com\r\nEND:VEVENT\r\nEND:VCALENDAR`;

    const invitation = parseInvitation({ ics, href: 'https://cloud.example.com/inbox/x.ics' }, account);

    expect(invitation).toBeUndefined();
  });
});

describe('fetchInvitations', () => {
  it('issues a calendar-query REPORT on the inbox and returns invitations', async () => {
    const ics = makeInvitationIcs();
    const xml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/remote.php/dav/calendars/bob/inbox/invite-001.ics</d:href>
    <d:propstat>
      <d:prop>
        <cal:calendar-data>${ics}</cal:calendar-data>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;
    mockFetch.mockResolvedValue({ status: 207, text: async () => xml });

    const invitations = await fetchInvitations(account);

    expect(invitations).toHaveLength(1);
    expect(invitations[0].uid).toBe('invite-001');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://cloud.example.com/remote.php/dav/calendars/bob/inbox/',
      expect.objectContaining({
        method: 'REPORT',
        headers: expect.objectContaining({ Depth: '1' }),
      }),
    );
  });

  it('returns an empty array when the inbox is empty', async () => {
    mockFetch.mockResolvedValue({
      status: 207,
      text: async () => '<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav"></d:multistatus>',
    });

    const invitations = await fetchInvitations(account);

    expect(invitations).toEqual([]);
  });
});

describe('respondToInvitation', () => {
  it('PUTs the accepted event into the target calendar and DELETEs the inbox item', async () => {
    const invitation = parseInvitation({
      ics: makeInvitationIcs(),
      href: 'https://cloud.example.com/remote.php/dav/calendars/bob/inbox/invite-001.ics',
    }, account)!;

    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 207, text: async () => '<d:multistatus xmlns:d="DAV:"></d:multistatus>' }) // REPORT: no existing event
      .mockResolvedValueOnce({ ok: true, status: 201 }) // PUT
      .mockResolvedValueOnce({ ok: true, status: 204 }); // DELETE inbox item

    await respondToInvitation(account, invitation, 'accepted', targetCalendar);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    const putCall = mockFetch.mock.calls[1];
    expect(putCall[0]).toBe('https://cloud.example.com/remote.php/dav/calendars/bob/personal/invite-001.ics');
    expect(putCall[1].method).toBe('PUT');
    const putBody = putCall[1].body as string;
    const unfolded = putBody.replace(/\r?\n[ \t]/g, '');
    expect(unfolded).toContain('PARTSTAT=ACCEPTED');
    expect(unfolded).not.toMatch(/^METHOD:/m);

    // No scheduling outbox POST — the server's iTIP broker delivers the REPLY itself.
    expect(mockFetch.mock.calls.some((c) => c[1].method === 'POST')).toBe(false);

    const deleteCall = mockFetch.mock.calls[2];
    expect(deleteCall[0]).toBe(invitation.href);
    expect(deleteCall[1].method).toBe('DELETE');
  });

  it('decline PUTs PARTSTAT=DECLINED on the existing copy and removes the inbox item', async () => {
    const invitation = parseInvitation({
      ics: makeInvitationIcs(),
      href: 'https://cloud.example.com/remote.php/dav/calendars/bob/inbox/invite-001.ics',
    }, account)!;

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 207,
        text: async () => `<d:multistatus xmlns:d="DAV:">
          <d:response>
            <d:href>/remote.php/dav/calendars/bob/personal/invite-001.ics</d:href>
          </d:response>
        </d:multistatus>`,
      }) // REPORT: existing calendar event
      .mockResolvedValueOnce({ ok: true, status: 204 }) // PUT DECLINED
      .mockResolvedValueOnce({ ok: true, status: 204 }); // DELETE inbox item

    await respondToInvitation(account, invitation, 'declined', targetCalendar);

    expect(mockFetch).toHaveBeenCalledTimes(3);

    const putCall = mockFetch.mock.calls[1];
    expect(putCall[0]).toBe('https://cloud.example.com/remote.php/dav/calendars/bob/personal/invite-001.ics');
    expect(putCall[1].method).toBe('PUT');
    const putBody = (putCall[1].body as string).replace(/\r?\n[ \t]/g, '');
    expect(putBody).toContain('PARTSTAT=DECLINED');
    expect(putBody).not.toMatch(/^METHOD:/m);

    // The event resource is kept (web parity) — only the inbox message is deleted.
    const deleteCall = mockFetch.mock.calls[2];
    expect(deleteCall[0]).toBe(invitation.href);
    expect(deleteCall[1].method).toBe('DELETE');
  });

  it('decline without an existing copy sends a stripped REPLY via the scheduling outbox', async () => {
    const invitation = parseInvitation({
      ics: makeInvitationIcs(
        'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;RSVP=TRUE;PARTSTAT=NEEDS-ACTION;CN=Carol:mailto:carol@example.com\r\n',
      ),
      href: 'https://cloud.example.com/remote.php/dav/calendars/bob/inbox/invite-001.ics',
    }, account)!;

    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 207, text: async () => '<d:multistatus xmlns:d="DAV:"></d:multistatus>' }) // REPORT: no existing event
      .mockResolvedValueOnce({ ok: true, status: 200 }) // outbox POST
      .mockResolvedValueOnce({ ok: true, status: 204 }); // DELETE inbox item

    await respondToInvitation(account, invitation, 'declined', targetCalendar);

    expect(mockFetch).toHaveBeenCalledTimes(3);

    const postCall = mockFetch.mock.calls[1];
    expect(postCall[0]).toBe('https://cloud.example.com/remote.php/dav/calendars/bob/outbox/');
    expect(postCall[1].method).toBe('POST');
    const replyUnfolded = (postCall[1].body as string).replace(/\r?\n[ \t]/g, '');
    expect(replyUnfolded).toContain('METHOD:REPLY');
    expect(replyUnfolded).toContain('PARTSTAT=DECLINED');
    // RFC 5546 §3.2.3 — only the replier's ATTENDEE line, other attendees stripped.
    expect(replyUnfolded).toContain('mailto:bob@example.com');
    expect(replyUnfolded).not.toContain('mailto:carol@example.com');
    expect((replyUnfolded.match(/ATTENDEE/g) ?? [])).toHaveLength(1);

    const deleteCall = mockFetch.mock.calls[2];
    expect(deleteCall[0]).toBe(invitation.href);
    expect(deleteCall[1].method).toBe('DELETE');
  });
});

describe('updateAttendeeStatus', () => {
  it('PUTs the updated event and relies on server scheduling when changing to tentative', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => makeCalendarEventIcs() }) // GET
      .mockResolvedValueOnce({ ok: true, status: 204 }); // PUT

    const nextAttendees = await updateAttendeeStatus(account, existingEvent, 'tentative');

    expect(mockFetch).toHaveBeenCalledTimes(2);

    const getCall = mockFetch.mock.calls[0];
    expect(getCall[0]).toBe(existingEvent.href);
    expect(getCall[1].method).toBe('GET');

    const putCall = mockFetch.mock.calls[1];
    expect(putCall[0]).toBe(existingEvent.href);
    expect(putCall[1].method).toBe('PUT');
    const putBody = putCall[1].body as string;
    const unfolded = putBody.replace(/\r?\n[ \t]/g, '');
    expect(unfolded).toContain('PARTSTAT=TENTATIVE');
    expect(unfolded).toContain('RSVP=FALSE');
    expect(unfolded).not.toMatch(/^METHOD:/m);
    // REPLY must not bump the organizer's SEQUENCE.
    expect(unfolded).toContain('SEQUENCE:1');

    expect(nextAttendees).toEqual([
      expect.objectContaining({
        email: 'bob@example.com',
        displayName: 'Bob',
        partstat: 'tentative',
        role: 'REQ-PARTICIPANT',
        rsvp: false,
      }),
    ]);
  });

  it('decline PUTs PARTSTAT=DECLINED and keeps the event resource', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => makeCalendarEventIcs() }) // GET
      .mockResolvedValueOnce({ ok: true, status: 204 }); // PUT

    const nextAttendees = await updateAttendeeStatus(account, existingEvent, 'declined');

    expect(mockFetch).toHaveBeenCalledTimes(2);

    const putCall = mockFetch.mock.calls[1];
    expect(putCall[1].method).toBe('PUT');
    const putBody = (putCall[1].body as string).replace(/\r?\n[ \t]/g, '');
    expect(putBody).toContain('PARTSTAT=DECLINED');

    expect(mockFetch.mock.calls.some((c) => c[1].method === 'DELETE')).toBe(false);

    expect(nextAttendees).toEqual([
      expect.objectContaining({ email: 'bob@example.com', partstat: 'declined' }),
    ]);
  });

  it('patches PARTSTAT on recurrence overrides too, not only the master VEVENT', async () => {
    const override = `BEGIN:VEVENT\r\nUID:invite-001\r\nRECURRENCE-ID;TZID=Europe/Paris:20260904T140000\r\nDTSTAMP:20260827T120000Z\r\nSEQUENCE:1\r\nDTSTART;TZID=Europe/Paris:20260904T140000\r\nDTEND;TZID=Europe/Paris:20260904T150000\r\nSUMMARY:Team meeting (moved)\r\nORGANIZER;CN=Alice:mailto:alice@example.com\r\nATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;RSVP=FALSE;PARTSTAT=ACCEPTED;CN=Bob:mailto:bob@example.com\r\nEND:VEVENT\r\n`;
    const recurringIcs = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\nBEGIN:VEVENT\r\nUID:invite-001\r\nDTSTAMP:20260827T120000Z\r\nSEQUENCE:1\r\nDTSTART;TZID=Europe/Paris:20260828T140000\r\nDTEND;TZID=Europe/Paris:20260828T150000\r\nRRULE:FREQ=WEEKLY\r\nSUMMARY:Team meeting\r\nORGANIZER;CN=Alice:mailto:alice@example.com\r\nATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;RSVP=FALSE;PARTSTAT=ACCEPTED;CN=Bob:mailto:bob@example.com\r\nEND:VEVENT\r\n${override}END:VCALENDAR`;

    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => recurringIcs })
      .mockResolvedValueOnce({ ok: true, status: 204 });

    await updateAttendeeStatus(account, existingEvent, 'tentative');

    const putBody = (mockFetch.mock.calls[1][1].body as string).replace(/\r?\n[ \t]/g, '');
    expect(putBody.match(/PARTSTAT=TENTATIVE/g)).toHaveLength(2);
  });

  it('refuses to guess the attendee when the username fallback is ambiguous', async () => {
    const noEmailAccount: Account = { ...account, email: undefined };
    const ambiguousIcs = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\nBEGIN:VEVENT\r\nUID:invite-001\r\nDTSTAMP:20260827T120000Z\r\nDTSTART:20260828T140000Z\r\nDTEND:20260828T150000Z\r\nSUMMARY:Team meeting\r\nORGANIZER;CN=Alice:mailto:alice@example.com\r\nATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:bob@a.com\r\nATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:bob@b.com\r\nEND:VEVENT\r\nEND:VCALENDAR`;

    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => ambiguousIcs });

    await expect(updateAttendeeStatus(noEmailAccount, existingEvent, 'accepted')).rejects.toThrow(
      'Current account is not an attendee of this event',
    );
    // No PUT must have happened.
    expect(mockFetch.mock.calls.filter((c) => c[1]?.method === 'PUT')).toHaveLength(0);
  });

  it('throws when the current account is not an attendee', async () => {
    const otherAccount: Account = { ...account, email: 'nobody@example.com', username: 'nobody' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => makeCalendarEventIcs(),
    });

    await expect(updateAttendeeStatus(otherAccount, existingEvent, 'tentative')).rejects.toThrow(
      'Current account is not an attendee of this event',
    );
  });
});
