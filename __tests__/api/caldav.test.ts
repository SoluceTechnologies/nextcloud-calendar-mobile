import { deleteEvent, moveEvent, syncCollection, fetchEventsByHrefs, MULTIGET_BATCH } from '../../src/services/nextcloud/caldav';
import type { Account, CalendarMeta } from '../../src/types';

const account: Account = {
  id: 'acc-1',
  displayName: 'Work',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'xxxx',
  davUserId: 'john',
};

const targetCalendar: CalendarMeta = {
  id: 'cal-work',
  accountId: 'acc-1',
  displayName: 'Work',
  color: '#ff0000',
  ctag: '1',
  url: 'https://cloud.example.com/remote.php/dav/calendars/john/work/',
  slug: 'work',
};

const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('deleteEvent', () => {
  it('sends DELETE to the given href', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204 });
    await deleteEvent(account, 'https://cloud.example.com/remote.php/dav/calendars/john/personal/uid-abc.ics');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://cloud.example.com/remote.php/dav/calendars/john/personal/uid-abc.ics',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('treats 404 as success (already deleted)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(
      deleteEvent(account, 'https://cloud.example.com/remote.php/dav/calendars/john/personal/uid-abc.ics')
    ).resolves.toBeUndefined();
  });

  it('throws on other error status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(
      deleteEvent(account, 'https://cloud.example.com/remote.php/dav/calendars/john/personal/uid-abc.ics')
    ).rejects.toThrow('deleteEvent HTTP 500');
  });
});

describe('moveEvent', () => {
  const fromHref = 'https://cloud.example.com/remote.php/dav/calendars/john/personal/uid-abc.ics';

  it('sends MOVE from the source href to the target collection with Destination + Overwrite', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 201 });
    await moveEvent(account, fromHref, targetCalendar, 'uid-abc');
    expect(mockFetch).toHaveBeenCalledWith(
      fromHref,
      expect.objectContaining({
        method: 'MOVE',
        headers: expect.objectContaining({
          Destination: 'https://cloud.example.com/remote.php/dav/calendars/john/work/uid-abc.ics',
          Overwrite: 'T',
        }),
      })
    );
  });

  it('treats 204 No Content as success', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 204 });
    await expect(moveEvent(account, fromHref, targetCalendar, 'uid-abc')).resolves.toBeUndefined();
  });

  it('throws on error status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 502, text: () => Promise.resolve('') });
    await expect(moveEvent(account, fromHref, targetCalendar, 'uid-abc')).rejects.toThrow('moveEvent HTTP 502');
  });
});

describe('syncCollection', () => {
  const cal = targetCalendar;

  it('sends a sync-collection REPORT carrying the token and parses changed/deleted/token', async () => {
    const xml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/remote.php/dav/calendars/john/work/a.ics</d:href>
    <d:propstat><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/calendars/john/work/gone.ics</d:href>
    <d:status>HTTP/1.1 404 Not Found</d:status>
  </d:response>
  <d:sync-token>http://sabre.io/ns/sync/42</d:sync-token>
</d:multistatus>`;
    mockFetch.mockResolvedValue({ status: 207, text: async () => xml });

    const res = await syncCollection(account, cal, 'http://sabre.io/ns/sync/40');

    expect(mockFetch).toHaveBeenCalledWith(cal.url, expect.objectContaining({ method: 'REPORT' }));
    const body = mockFetch.mock.calls[0][1].body as string;
    expect(body).toContain('sync-collection');
    expect(body).toContain('<d:sync-token>http://sabre.io/ns/sync/40</d:sync-token>');
    expect(res.changed).toEqual(['https://cloud.example.com/remote.php/dav/calendars/john/work/a.ics']);
    expect(res.deleted).toEqual(['https://cloud.example.com/remote.php/dav/calendars/john/work/gone.ics']);
    expect(res.newToken).toBe('http://sabre.io/ns/sync/42');
    expect(res.reset).toBe(false);
  });

  it('sends an empty sync-token on first run (no stored token)', async () => {
    mockFetch.mockResolvedValue({
      status: 207,
      text: async () => `<d:multistatus xmlns:d="DAV:"><d:sync-token>t1</d:sync-token></d:multistatus>`,
    });
    await syncCollection(account, cal, undefined);
    const body = mockFetch.mock.calls[0][1].body as string;
    expect(body).toContain('<d:sync-token></d:sync-token>');
  });

  it('signals reset on 507 (invalid/expired token)', async () => {
    mockFetch.mockResolvedValue({ status: 507, text: async () => '' });
    const res = await syncCollection(account, cal, 'stale');
    expect(res.reset).toBe(true);
  });
});

describe('fetchEventsByHrefs', () => {
  const cal = targetCalendar;
  const range = { s: new Date('2026-01-01T00:00:00Z'), e: new Date('2026-12-31T00:00:00Z') };
  const icsFor = (uid: string) =>
    `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:${uid}\r\nDTSTART:20260615T090000Z\r\nDTEND:20260615T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  const respFor = (path: string, uid: string) =>
    `<d:response><d:href>${path}</d:href><d:propstat><d:prop><cal:calendar-data>${icsFor(uid)}</cal:calendar-data></d:prop></d:propstat></d:response>`;

  it('sends one multiget with all hrefs when under the batch size', async () => {
    const xml = `<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">${respFor('/p/a.ics', 'a')}</d:multistatus>`;
    mockFetch.mockResolvedValue({ status: 207, text: async () => xml });

    const events = await fetchEventsByHrefs(
      account, cal, ['https://cloud.example.com/p/a.ics'], range.s, range.e,
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = mockFetch.mock.calls[0][1].body as string;
    expect(body).toContain('calendar-multiget');
    expect(body).toContain('<d:href>/p/a.ics</d:href>');
    expect(events.map((e) => e.uid)).toEqual(['a']);
  });

  it('splits into multiple requests above MULTIGET_BATCH', async () => {
    mockFetch.mockResolvedValue({
      status: 207,
      text: async () => `<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav"></d:multistatus>`,
    });
    const hrefs = Array.from({ length: MULTIGET_BATCH + 1 }, (_, i) => `https://cloud.example.com/p/${i}.ics`);
    await fetchEventsByHrefs(account, cal, hrefs, range.s, range.e);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns [] for an empty href list without hitting the network', async () => {
    const events = await fetchEventsByHrefs(account, cal, [], range.s, range.e);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });
});
