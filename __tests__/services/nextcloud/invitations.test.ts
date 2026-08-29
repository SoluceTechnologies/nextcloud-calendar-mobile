import { parseInvitation, fetchInvitations, respondToInvitation } from '../../../src/services/nextcloud/invitations';
import type { Account, CalendarMeta } from '../../../src/types';

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
      .mockResolvedValueOnce({ ok: false, status: 404 }) // outbox POST ignored
      .mockResolvedValueOnce({ ok: true, status: 204 }); // DELETE

    await respondToInvitation(account, invitation, 'accepted', targetCalendar);

    expect(mockFetch).toHaveBeenCalledTimes(4);
    const putCall = mockFetch.mock.calls[1];
    expect(putCall[0]).toBe('https://cloud.example.com/remote.php/dav/calendars/bob/personal/invite-001.ics');
    expect(putCall[1].method).toBe('PUT');
    const putBody = putCall[1].body as string;
    const unfolded = putBody.replace(/\r?\n[ \t]/g, '');
    expect(unfolded).toContain('PARTSTAT=ACCEPTED');
    expect(unfolded).not.toMatch(/^METHOD:/m);

    const deleteCall = mockFetch.mock.calls[3];
    expect(deleteCall[0]).toBe(invitation.href);
    expect(deleteCall[1].method).toBe('DELETE');
  });

  it('decline sends a reply, deletes the calendar event, and deletes the inbox item', async () => {
    const invitation = parseInvitation({
      ics: makeInvitationIcs(),
      href: 'https://cloud.example.com/remote.php/dav/calendars/bob/inbox/invite-001.ics',
    }, account)!;

    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 404 }) // outbox POST ignored
      .mockResolvedValueOnce({
        ok: true,
        status: 207,
        text: async () => `<d:multistatus xmlns:d="DAV:">
          <d:response>
            <d:href>/remote.php/dav/calendars/bob/personal/invite-001.ics</d:href>
          </d:response>
        </d:multistatus>`,
      }) // REPORT: existing calendar event
      .mockResolvedValueOnce({ ok: true, status: 204 }) // DELETE calendar event
      .mockResolvedValueOnce({ ok: true, status: 204 }); // DELETE inbox item

    await respondToInvitation(account, invitation, 'declined', targetCalendar);

    expect(mockFetch).toHaveBeenCalledTimes(4);

    const reportCall = mockFetch.mock.calls[1];
    expect(reportCall[0]).toBe(targetCalendar.url);
    expect(reportCall[1].method).toBe('REPORT');

    const deleteCalendarCall = mockFetch.mock.calls[2];
    expect(deleteCalendarCall[0]).toBe('https://cloud.example.com/remote.php/dav/calendars/bob/personal/invite-001.ics');
    expect(deleteCalendarCall[1].method).toBe('DELETE');

    const deleteInboxCall = mockFetch.mock.calls[3];
    expect(deleteInboxCall[0]).toBe(invitation.href);
    expect(deleteInboxCall[1].method).toBe('DELETE');
  });
});
