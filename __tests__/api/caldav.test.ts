import { deleteEvent, moveEvent, syncCollection, fetchEvents, fetchEventsByHrefs, fetchCalendars, validateCredentials, MULTIGET_BATCH } from '../../src/services/nextcloud/caldav';
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

  it('returns undefined newToken when server sends an empty sync-token', async () => {
    mockFetch.mockResolvedValue({
      status: 207,
      text: async () => `<d:multistatus xmlns:d="DAV:"><d:response><d:href>/p/a.ics</d:href><d:propstat><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response><d:sync-token></d:sync-token></d:multistatus>`,
    });
    const res = await syncCollection(account, cal, 't0');
    expect(res.newToken).toBeUndefined();
    expect(res.reset).toBe(false);
  });

  it('signals reset on 507 (invalid/expired token)', async () => {
    mockFetch.mockResolvedValue({ status: 507, text: async () => '' });
    const res = await syncCollection(account, cal, 'stale');
    expect(res.reset).toBe(true);
  });
});

describe('fetchEvents', () => {
  const range = { s: new Date('2026-08-01T00:00:00Z'), e: new Date('2026-09-01T00:00:00Z') };
  const respFor = (ics: string, path: string) =>
    `<d:response><d:href>${path}</d:href><d:propstat><d:prop><cal:calendar-data>${ics}</cal:calendar-data></d:prop></d:propstat></d:response>`;
  const multistatus = (inner: string) =>
    `<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">${inner}</d:multistatus>`;

  it('issues separate VEVENT and VTODO queries and merges Deck cards (VTODO)', async () => {
    const eventIcs = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:ev-1\r\nSUMMARY:Meeting\r\nDTSTART:20260815T090000Z\r\nDTEND:20260815T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';
    const deckIcs = 'BEGIN:VCALENDAR\r\nBEGIN:VTODO\r\nUID:deck-1\r\nSUMMARY:Card\r\nDUE:20260816T090000Z\r\nEND:VTODO\r\nEND:VCALENDAR';

    mockFetch.mockImplementation((_url: string, opts: any) => {
      const body = opts.body as string;
      const xml = body.includes('name="VTODO"')
        ? multistatus(respFor(deckIcs, '/cal/deck-1.ics'))
        : multistatus(respFor(eventIcs, '/cal/ev-1.ics'));
      return Promise.resolve({ status: 207, text: async () => xml });
    });

    const events = await fetchEvents(account, targetCalendar, range.s, range.e);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const comps = mockFetch.mock.calls.map((c) =>
      (c[1].body as string).includes('name="VTODO"') ? 'VTODO' : 'VEVENT');
    expect(comps).toEqual(expect.arrayContaining(['VEVENT', 'VTODO']));
    expect(events.map((e) => e.uid).sort()).toEqual(['deck-1', 'ev-1']);
  });

  it('still returns VEVENTs when the VTODO query is rejected by the server', async () => {
    const eventIcs = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:ev-1\r\nSUMMARY:Meeting\r\nDTSTART:20260815T090000Z\r\nDTEND:20260815T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';
    mockFetch.mockImplementation((_url: string, opts: any) => {
      const body = opts.body as string;
      if (body.includes('name="VTODO"')) return Promise.resolve({ status: 400, text: async () => '' });
      return Promise.resolve({ status: 207, text: async () => multistatus(respFor(eventIcs, '/cal/ev-1.ics')) });
    });

    const events = await fetchEvents(account, targetCalendar, range.s, range.e);
    expect(events.map((e) => e.uid)).toEqual(['ev-1']);
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

describe('fetchCalendars', () => {
  const propfind = (displayname: string, extra = '') => `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/remote.php/dav/calendars/john/comics/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
        <d:displayname>${displayname}</d:displayname>
        <cs:getctag>42</cs:getctag>
        ${extra}
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;

  it('decodes XML entities in the display name', async () => {
    mockFetch.mockResolvedValue({ status: 207, text: async () => propfind('Calvin &amp; Hobbes') });

    const [cal] = await fetchCalendars(account);

    expect(cal.displayName).toBe('Calvin & Hobbes');
  });

  it('decodes the other escapes a name can carry', async () => {
    mockFetch.mockResolvedValue({
      status: 207,
      text: async () => propfind('caf&#233; &lt;perso&gt; &quot;2026&quot;'),
    });

    const [cal] = await fetchCalendars(account);

    expect(cal.displayName).toBe('café <perso> "2026"');
  });

  it('does not decode twice', async () => {
    mockFetch.mockResolvedValue({ status: 207, text: async () => propfind('A &amp;amp; B') });

    const [cal] = await fetchCalendars(account);

    expect(cal.displayName).toBe('A &amp; B');
  });

  it('falls back to the slug when the name is empty', async () => {
    mockFetch.mockResolvedValue({ status: 207, text: async () => propfind('') });

    const [cal] = await fetchCalendars(account);

    expect(cal.displayName).toBe('comics');
  });

  it('decodes an ampersand in a subscription source URL', async () => {
    mockFetch.mockResolvedValue({
      status: 207,
      text: async () => propfind(
        'Feed',
        '<cs:source><d:href>https://ics.example.com/f?a=1&amp;b=2</d:href></cs:source>',
      ),
    });

    const [cal] = await fetchCalendars(account);

    expect(cal.sourceUrl).toBe('https://ics.example.com/f?a=1&b=2');
  });

  it('marks a calendar that supports VEVENT as event-capable', async () => {
    mockFetch.mockResolvedValue({
      status: 207,
      text: async () => propfind(
        'Personal',
        '<c:supported-calendar-component-set><c:comp name="VEVENT"/><c:comp name="VTODO"/></c:supported-calendar-component-set>',
      ),
    });

    const [cal] = await fetchCalendars(account);

    expect(cal.supportsEvents).toBe(true);
  });

  it('marks a VTODO-only calendar as not event-capable', async () => {
    mockFetch.mockResolvedValue({
      status: 207,
      text: async () => propfind(
        'Tasks',
        '<c:supported-calendar-component-set><c:comp name="VTODO"/></c:supported-calendar-component-set>',
      ),
    });

    const [cal] = await fetchCalendars(account);

    expect(cal.supportsEvents).toBe(false);
  });

  it('assumes event support when the component set is absent', async () => {
    mockFetch.mockResolvedValue({ status: 207, text: async () => propfind('Legacy') });

    const [cal] = await fetchCalendars(account);

    expect(cal.supportsEvents).toBe(true);
  });

  it('treats a Deck board calendar as not event-capable via its URI', async () => {
    const deckXml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/remote.php/dav/calendars/john/app-generated--deck--board-3/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
        <d:displayname>Roadmap</d:displayname>
        <cs:getctag>7</cs:getctag>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;
    mockFetch.mockResolvedValue({ status: 207, text: async () => deckXml });

    const [cal] = await fetchCalendars(account);

    expect(cal.supportsEvents).toBe(false);
  });
});

describe('validateCredentials davUserId discovery', () => {
  const creds = { baseUrl: 'https://cloud.example.com', username: 'jdoe', appPassword: 'xxxx' };

  const principalXml = (href: string) =>
    `<d:multistatus xmlns:d="DAV:"><d:response><d:href>/remote.php/dav/</d:href><d:propstat><d:prop>` +
    `<d:current-user-principal><d:href>${href}</d:href></d:current-user-principal>` +
    `</d:prop></d:propstat></d:response></d:multistatus>`;
  const homeXml = (href: string) =>
    `<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/x</d:href><d:propstat><d:prop>` +
    `<cal:calendar-home-set><d:href>${href}</d:href></cal:calendar-home-set>` +
    `</d:prop></d:propstat></d:response></d:multistatus>`;

  it('returns the calendar-home segment (UUID) for an LDAP account', async () => {
    const uuid = '143A944C-B602-469F-BB9D-F4241F188524';
    mockFetch
      .mockResolvedValueOnce({ status: 207, ok: true, text: async () => principalXml('/remote.php/dav/principals/users/' + uuid + '/') })
      .mockResolvedValueOnce({ status: 207, ok: true, text: async () => homeXml('/remote.php/dav/calendars/' + uuid + '/') });

    const res = await validateCredentials(creds);

    expect(res.davUserId).toBe(uuid);
    expect(new URL(mockFetch.mock.calls[1][0]).pathname).toBe('/remote.php/dav/principals/users/' + uuid + '/');
  });

  it('returns the login name unchanged for a database account', async () => {
    mockFetch
      .mockResolvedValueOnce({ status: 207, ok: true, text: async () => principalXml('/remote.php/dav/principals/users/jdoe/') })
      .mockResolvedValueOnce({ status: 207, ok: true, text: async () => homeXml('/remote.php/dav/calendars/jdoe/') });

    const res = await validateCredentials(creds);

    expect(res.davUserId).toBe('jdoe');
  });

  it('falls back to the principal slug when calendar-home-set is not advertised', async () => {
    mockFetch
      .mockResolvedValueOnce({ status: 207, ok: true, text: async () => principalXml('/remote.php/dav/principals/users/jdoe/') })
      .mockResolvedValueOnce({ status: 207, ok: true, text: async () => '<d:multistatus xmlns:d="DAV:"></d:multistatus>' });

    const res = await validateCredentials(creds);

    expect(res.davUserId).toBe('jdoe');
  });

  it('falls back to the principal slug when the home PROPFIND errors', async () => {
    mockFetch
      .mockResolvedValueOnce({ status: 207, ok: true, text: async () => principalXml('/remote.php/dav/principals/users/jdoe/') })
      .mockResolvedValueOnce({ status: 500, ok: false, text: async () => '' });

    const res = await validateCredentials(creds);

    expect(res.davUserId).toBe('jdoe');
  });

  it('falls back to the login name when current-user-principal is not advertised', async () => {
    mockFetch
      .mockResolvedValueOnce({ status: 207, ok: true, text: async () => '<d:multistatus xmlns:d="DAV:"></d:multistatus>' })
      .mockResolvedValueOnce({ status: 207, ok: true, text: async () => '' });

    const res = await validateCredentials(creds);

    expect(res.davUserId).toBe('jdoe');
    expect(mockFetch.mock.calls[1][0]).toBe('https://cloud.example.com/remote.php/dav/principals/users/jdoe/');
  });

  it('resolves the principal against the origin on a subdirectory install', async () => {
    const uuid = 'ABCDEF';
    mockFetch
      .mockResolvedValueOnce({ status: 207, ok: true, text: async () => principalXml('/nextcloud/remote.php/dav/principals/users/' + uuid + '/') })
      .mockResolvedValueOnce({ status: 207, ok: true, text: async () => homeXml('/nextcloud/remote.php/dav/calendars/' + uuid + '/') });

    const res = await validateCredentials({ ...creds, baseUrl: 'https://cloud.example.com/nextcloud' });

    expect(res.davUserId).toBe(uuid);
    expect(mockFetch.mock.calls[1][0]).toBe('https://cloud.example.com/nextcloud/remote.php/dav/principals/users/' + uuid + '/');
  });
});

describe('Nextcloud installed in a subdirectory', () => {
  const subAccount: Account = {
    id: 'acc-2',
    displayName: 'Subfolder',
    baseUrl: 'https://cloud.example.com/nextcloud',
    username: 'john',
    appPassword: 'xxxx',
    davUserId: 'john',
  };
  const subCal: CalendarMeta = {
    id: 'cal-sub',
    accountId: 'acc-2',
    displayName: 'Personal',
    color: '#1976d2',
    ctag: '1',
    url: 'https://cloud.example.com/nextcloud/remote.php/dav/calendars/john/personal/',
    slug: 'personal',
  };

  it('syncCollection does not duplicate the subfolder in changed/deleted hrefs', async () => {
    const xml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/nextcloud/remote.php/dav/calendars/john/personal/a.ics</d:href>
    <d:propstat><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
  </d:response>
  <d:response>
    <d:href>/nextcloud/remote.php/dav/calendars/john/personal/gone.ics</d:href>
    <d:status>HTTP/1.1 404 Not Found</d:status>
  </d:response>
  <d:sync-token>http://sabre.io/ns/sync/1</d:sync-token>
</d:multistatus>`;
    mockFetch.mockResolvedValue({ status: 207, text: async () => xml });

    const res = await syncCollection(subAccount, subCal, undefined);

    expect(res.changed).toEqual(['https://cloud.example.com/nextcloud/remote.php/dav/calendars/john/personal/a.ics']);
    expect(res.deleted).toEqual(['https://cloud.example.com/nextcloud/remote.php/dav/calendars/john/personal/gone.ics']);
  });

  it('fetchCalendars builds the calendar url without duplicating the subfolder', async () => {
    const xml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/nextcloud/remote.php/dav/calendars/john/personal/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
        <d:displayname>Personal</d:displayname>
        <cs:getctag>42</cs:getctag>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;
    mockFetch.mockResolvedValue({ status: 207, text: async () => xml });

    const [cal] = await fetchCalendars(subAccount);

    expect(cal.url).toBe('https://cloud.example.com/nextcloud/remote.php/dav/calendars/john/personal/');
  });

  it('fetchEventsByHrefs builds event hrefs without duplicating the subfolder', async () => {
    const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a\r\nSUMMARY:a\r\nDTSTART:20260615T090000Z\r\nDTEND:20260615T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';
    const xml = `<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/nextcloud/remote.php/dav/calendars/john/personal/a.ics</d:href><d:propstat><d:prop><cal:calendar-data>${ics}</cal:calendar-data></d:prop></d:propstat></d:response></d:multistatus>`;
    mockFetch.mockResolvedValue({ status: 207, text: async () => xml });

    const events = await fetchEventsByHrefs(
      subAccount, subCal,
      ['https://cloud.example.com/nextcloud/remote.php/dav/calendars/john/personal/a.ics'],
      new Date('2026-01-01T00:00:00Z'), new Date('2026-12-31T00:00:00Z'),
    );

    expect(events[0].href).toBe('https://cloud.example.com/nextcloud/remote.php/dav/calendars/john/personal/a.ics');
  });
});
