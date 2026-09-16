import { buildFreeBusyIcs, schedulingOutboxUrl, fetchFreeBusy } from '@/services/nextcloud/freeBusy';
import type { Account, Attendee } from '@/types';

const account: Account = {
  id: 'acc-1',
  displayName: 'Work',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'xxxx',
  davUserId: 'john',
};

const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('schedulingOutboxUrl', () => {
  it('derives the outbox URL from the account', () => {
    expect(schedulingOutboxUrl(account)).toBe(
      'https://cloud.example.com/remote.php/dav/calendars/john/outbox/',
    );
  });

  it('encodes the davUserId', () => {
    const acc = { ...account, davUserId: 'john.doe' };
    expect(schedulingOutboxUrl(acc)).toContain('john.doe');
  });
});

describe('buildFreeBusyIcs', () => {
  const organizer: Attendee = { email: 'john@example.com', displayName: 'John' };
  const attendees: Attendee[] = [{ email: 'jane@example.com', displayName: 'Jane' }];

  it('produces a valid VCALENDAR with METHOD:REQUEST', () => {
    const ics = buildFreeBusyIcs(new Date('2026-08-28T10:00Z'), new Date('2026-08-28T11:00Z'), organizer, attendees);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('BEGIN:VFREEBUSY');
    expect(ics).toContain('END:VFREEBUSY');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('includes the organizer with CN', () => {
    const ics = buildFreeBusyIcs(new Date('2026-08-28T10:00Z'), new Date('2026-08-28T11:00Z'), organizer, attendees);
    expect(ics).toContain('ORGANIZER;CN=John:mailto:john@example.com');
  });

  it('includes all attendees', () => {
    const ics = buildFreeBusyIcs(new Date('2026-08-28T10:00Z'), new Date('2026-08-28T11:00Z'), organizer, attendees);
    expect(ics).toContain('ATTENDEE;CN=Jane:mailto:jane@example.com');
  });

  it('expands to full-day boundaries', () => {
    const ics = buildFreeBusyIcs(new Date('2026-08-28T10:00Z'), new Date('2026-08-28T11:00Z'), organizer, attendees);
    // DTSTART should be at 00:00:00Z
    expect(ics).toContain('DTSTART:20260828T000000Z');
    // DTEND should be at 23:59:59Z
    expect(ics).toContain('DTEND:20260828T235959Z');
  });

  it('generates a unique UID', () => {
    const ics1 = buildFreeBusyIcs(new Date('2026-08-28T10:00Z'), new Date('2026-08-28T11:00Z'), organizer, attendees);
    const ics2 = buildFreeBusyIcs(new Date('2026-08-28T10:00Z'), new Date('2026-08-28T11:00Z'), organizer, attendees);
    const uid1 = ics1.match(/UID:([^\r\n]+)/)?.[1];
    const uid2 = ics2.match(/UID:([^\r\n]+)/)?.[1];
    expect(uid1).not.toBe(uid2);
  });
});

describe('fetchFreeBusy', () => {
  const organizer: Attendee = { email: 'john@example.com' };
  const attendees: Attendee[] = [{ email: 'jane@example.com' }];

  function scheduleResponse(entries: { recipient: string; status: string; calendarData?: string }[]): string {
    const responses = entries.map((e) => {
      const calData = e.calendarData
        ? `<cal:calendar-data>${e.calendarData}</cal:calendar-data>`
        : '';
      return `<cal:response>
        <cal:recipient><d:href>${e.recipient}</d:href></cal:recipient>
        <cal:request-status>${e.status}</cal:request-status>
        ${calData}
      </cal:response>`;
    }).join('');
    return `<?xml version="1.0"?><cal:schedule-response xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">${responses}</cal:schedule-response>`;
  }

  const vfreebusyReply = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VFREEBUSY\r\nFREEBUSY:20260828T100000Z/20260828T110000Z\r\nEND:VFREEBUSY\r\nEND:VCALENDAR\r\n`;

  it('returns availability for each attendee', async () => {
    mockFetch.mockResolvedValue({
      status: 207,
      ok: true,
      headers: { forEach: (cb: (v: string, k: string) => void) => {} },
      text: async () => scheduleResponse([
        { recipient: 'mailto:jane@example.com', status: '2.0;Success', calendarData: vfreebusyReply },
      ]),
    });

    const results = await fetchFreeBusy(account, organizer, attendees, new Date('2026-08-28T10:00Z'), new Date('2026-08-28T11:00Z'));
    expect(results).toHaveLength(1);
    expect(results[0].email).toBe('jane@example.com');
    expect(results[0].available).toBe(true);
    expect(results[0].slots).toHaveLength(1);
    expect(results[0].slots[0].start.toISOString()).toBe('2026-08-28T10:00:00.000Z');
  });

  it('marks attendees with error status as unavailable', async () => {
    mockFetch.mockResolvedValue({
      status: 207,
      ok: true,
      headers: { forEach: (cb: (v: string, k: string) => void) => {} },
      text: async () => scheduleResponse([
        { recipient: 'mailto:external@example.com', status: '3.7;Could not find principal' },
      ]),
    });

    const results = await fetchFreeBusy(account, organizer, [{ email: 'external@example.com' }], new Date('2026-08-28T10:00Z'), new Date('2026-08-28T11:00Z'));
    expect(results[0].available).toBe(false);
    expect(results[0].slots).toEqual([]);
  });

  it('returns availability for multiple attendees', async () => {
    const vfreebusyReplyAlice = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VFREEBUSY\r\nFREEBUSY:20260828T100000Z/20260828T110000Z\r\nEND:VFREEBUSY\r\nEND:VCALENDAR\r\n`;
    const vfreebusyReplyBob = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VFREEBUSY\r\nFREEBUSY:20260828T120000Z/20260828T130000Z\r\nEND:VFREEBUSY\r\nEND:VCALENDAR\r\n`;

    mockFetch.mockResolvedValue({
      status: 207,
      ok: true,
      headers: { forEach: (cb: (v: string, k: string) => void) => {} },
      text: async () => scheduleResponse([
        { recipient: 'mailto:alice@example.com', status: '2.0;Success', calendarData: vfreebusyReplyAlice },
        { recipient: 'mailto:bob@example.com', status: '2.0;Success', calendarData: vfreebusyReplyBob },
      ]),
    });

    const multipleAttendees: Attendee[] = [
      { email: 'alice@example.com', displayName: 'Alice' },
      { email: 'bob@example.com', displayName: 'Bob' },
    ];

    const results = await fetchFreeBusy(account, organizer, multipleAttendees, new Date('2026-08-28T10:00Z'), new Date('2026-08-28T11:00Z'));
    expect(results).toHaveLength(2);
    expect(results[0].email).toBe('alice@example.com');
    expect(results[0].slots).toHaveLength(1);
    expect(results[0].slots[0].start.toISOString()).toBe('2026-08-28T10:00:00.000Z');
    expect(results[1].email).toBe('bob@example.com');
    expect(results[1].slots).toHaveLength(1);
    expect(results[1].slots[0].start.toISOString()).toBe('2026-08-28T12:00:00.000Z');
  });

  it('marks one attendee as unavailable while others are available', async () => {
    mockFetch.mockResolvedValue({
      status: 207,
      ok: true,
      headers: { forEach: (cb: (v: string, k: string) => void) => {} },
      text: async () => scheduleResponse([
        { recipient: 'mailto:alice@example.com', status: '2.0;Success', calendarData: vfreebusyReply },
        { recipient: 'mailto:external@example.com', status: '3.7;Could not find principal' },
      ]),
    });

    const mixedAttendees: Attendee[] = [
      { email: 'alice@example.com' },
      { email: 'external@example.com' },
    ];

    const results = await fetchFreeBusy(account, organizer, mixedAttendees, new Date('2026-08-28T10:00Z'), new Date('2026-08-28T11:00Z'));
    expect(results[0].available).toBe(true);
    expect(results[1].available).toBe(false);
  });

  it('returns empty array for no attendees', async () => {
    const results = await fetchFreeBusy(account, organizer, [], new Date('2026-08-28T10:00Z'), new Date('2026-08-28T11:00Z'));
    expect(results).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws on non-207 error response', async () => {
    mockFetch.mockResolvedValue({
      status: 403,
      ok: false,
      headers: { forEach: (cb: (v: string, k: string) => void) => {} },
      text: async () => 'Forbidden',
    });

    await expect(
      fetchFreeBusy(account, organizer, attendees, new Date('2026-08-28T10:00Z'), new Date('2026-08-28T11:00Z')),
    ).rejects.toThrow('fetchFreeBusy HTTP 403');
  });
});
