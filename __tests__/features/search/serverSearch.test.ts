import dayjs from 'dayjs';

import { parseQuery } from '@/features/search/parseQuery';
import { davPathFromResourceUrl, hrefPath, serverRequest, toServerHits } from '@/features/search/serverSearch';
import type { CalendarSearchEntry } from '@/services/nextcloud/search';
import type { CalendarMeta } from '@/types';

const now = new Date(2026, 10, 2, 10, 0).getTime();
const toBase64 = (text: string) => Buffer.from(text).toString('base64');
const resourceUrlFor = (path: string, host = 'https://cloud.test') =>
  `${host}/index.php/apps/calendar/edit/${toBase64(path)}`;

function makeCalendar(id: string, overrides: Partial<CalendarMeta> = {}): CalendarMeta {
  return {
    id,
    accountId: 'account-1',
    displayName: id,
    color: '#0082c9',
    ctag: '',
    url: `https://cloud.test/remote.php/dav/calendars/alice/${id}/`,
    slug: id,
    ...overrides,
  };
}

const calendars = [
  makeCalendar('personal', { displayName: 'Personal' }),
  makeCalendar('work', { displayName: 'Work', url: 'https://cloud.test/remote.php/dav/calendars/alice/my%20work/' }),
  makeCalendar('subscribed', { isSubscribed: true }),
  makeCalendar('hidden'),
];

function entryFor(path: string, overrides: Partial<CalendarSearchEntry> = {}): CalendarSearchEntry {
  return { title: 'Team lunch', subline: 'Nov 2', resourceUrl: resourceUrlFor(path), start: new Date(now), ...overrides };
}

const context = (overrides: Partial<Parameters<typeof toServerHits>[1]> = {}) => ({
  baseUrl: 'https://cloud.test',
  calendars,
  hiddenCalendarIds: ['hidden'],
  knownHrefs: new Set<string>(),
  query: parseQuery('lunch'),
  ...overrides,
});

describe('hrefPath', () => {
  it('returns the decoded path of an absolute or relative href', () => {
    expect(hrefPath('https://cloud.test/remote.php/dav/calendars/alice/my%20work/x.ics')).toBe(
      '/remote.php/dav/calendars/alice/my work/x.ics',
    );
    expect(hrefPath('/remote.php/dav/calendars/alice/my%20work/')).toBe('/remote.php/dav/calendars/alice/my work/');
  });

  it('keeps a malformed escape as is', () => {
    expect(hrefPath('/remote.php/dav/calendars/alice/100%/x.ics')).toBe('/remote.php/dav/calendars/alice/100%/x.ics');
  });
});

describe('serverRequest', () => {
  it('joins free words into one term', () => {
    expect(serverRequest(parseQuery('team lunch'), now)).toEqual({ term: 'team lunch' });
  });

  it('null under 2 characters', () => {
    expect(serverRequest(parseQuery('a'), now)).toBeNull();
    expect(serverRequest(parseQuery(''), now)).toBeNull();
    expect(serverRequest(parseQuery('calendar:Work'), now)).toBeNull();
  });

  it('null with a title, location, description or attendee token', () => {
    expect(serverRequest(parseQuery('lunch title:team'), now)).toBeNull();
    expect(serverRequest(parseQuery('lunch location:paris'), now)).toBeNull();
    expect(serverRequest(parseQuery('lunch description:menu'), now)).toBeNull();
    expect(serverRequest(parseQuery('lunch attendee:bob@example.org'), now)).toBeNull();
  });

  it('keeps calendar tokens', () => {
    expect(serverRequest(parseQuery('lunch calendar:Work'), now)).toEqual({ term: 'lunch' });
  });

  it('week maps to now … now+7d', () => {
    expect(serverRequest(parseQuery('lunch date:week'), now)).toEqual({
      term: 'lunch',
      since: new Date(now).toISOString(),
      until: dayjs(now).add(7, 'day').toISOString(),
    });
  });

  it('<2026-12-01 maps until to that day start', () => {
    expect(serverRequest(parseQuery('lunch date:<2026-12-01'), now)).toEqual({
      term: 'lunch',
      until: new Date(2026, 11, 1).toISOString(),
    });
  });

  it('>2026-12-01 maps since to that day end', () => {
    expect(serverRequest(parseQuery('lunch date:>2026-12-01'), now)).toEqual({
      term: 'lunch',
      since: dayjs(new Date(2026, 11, 1)).endOf('day').toISOString(),
    });
  });

  it('today with past intersects', () => {
    expect(serverRequest(parseQuery('lunch date:today date:past'), now)).toEqual({
      term: 'lunch',
      since: dayjs(now).startOf('day').toISOString(),
      until: new Date(now).toISOString(),
    });
  });

  it('null for an unknown date value', () => {
    expect(serverRequest(parseQuery('lunch date:soon'), now)).toBeNull();
  });
});

describe('davPathFromResourceUrl', () => {
  it('decodes the dav path of a calendar deep link', () => {
    expect(davPathFromResourceUrl(resourceUrlFor('/remote.php/dav/calendars/alice/personal/a?b>c.ics'))).toBe(
      '/remote.php/dav/calendars/alice/personal/a?b>c.ics',
    );
  });

  it('decodes a non-ASCII user id as UTF-8', () => {
    expect(davPathFromResourceUrl(resourceUrlFor('/remote.php/dav/calendars/josé/personal/abc.ics'))).toBe(
      '/remote.php/dav/calendars/josé/personal/abc.ics',
    );
  });

  it('null for non-base64', () => {
    expect(davPathFromResourceUrl('https://cloud.test/apps/calendar/edit/%%%')).toBeNull();
  });

  it('null for a path outside /remote.php/dav/calendars/', () => {
    expect(davPathFromResourceUrl(resourceUrlFor('/remote.php/dav/files/alice/secret.txt'))).toBeNull();
    expect(davPathFromResourceUrl(resourceUrlFor('https://evil.test/remote.php/dav/calendars/alice/x.ics'))).toBeNull();
    expect(davPathFromResourceUrl('https://cloud.test/apps/files/')).toBeNull();
  });
});

describe('toServerHits', () => {
  it('maps a hit to its calendar and absolute href on the account origin', () => {
    const entry = entryFor('/remote.php/dav/calendars/alice/personal/abc.ics', {
      resourceUrl: resourceUrlFor('/remote.php/dav/calendars/alice/personal/abc.ics', 'https://evil.test'),
    });
    expect(toServerHits([entry], context())).toEqual([
      {
        title: 'Team lunch',
        subline: 'Nov 2',
        start: new Date(now),
        href: 'https://cloud.test/remote.php/dav/calendars/alice/personal/abc.ics',
        calendar: calendars[0],
      },
    ]);
  });

  it('keeps the webroot of a server installed in a subfolder', () => {
    const subfolder = makeCalendar('personal', { url: 'https://cloud.test/nextcloud/remote.php/dav/calendars/alice/personal/' });
    const [hit] = toServerHits(
      [entryFor('/nextcloud/remote.php/dav/calendars/alice/personal/abc.ics')],
      context({ baseUrl: 'https://cloud.test/nextcloud', calendars: [subfolder] }),
    );
    expect(hit.href).toBe('https://cloud.test/nextcloud/remote.php/dav/calendars/alice/personal/abc.ics');
  });

  it('percent-encodes the href once', () => {
    const accented = makeCalendar('personal', { url: 'https://cloud.test/remote.php/dav/calendars/jos%C3%A9/my%20cal/' });
    const [hit] = toServerHits(
      [entryFor('/remote.php/dav/calendars/josé/my%20cal/abc.ics')],
      context({ calendars: [accented] }),
    );
    expect(hit.href).toBe('https://cloud.test/remote.php/dav/calendars/jos%C3%A9/my%20cal/abc.ics');
  });

  it('drops unknown calendars, subscribed calendars and hidden calendars', () => {
    const entries = [
      entryFor('/remote.php/dav/calendars/alice/unknown/a.ics'),
      entryFor('/remote.php/dav/calendars/alice/subscribed/b.ics'),
      entryFor('/remote.php/dav/calendars/alice/hidden/c.ics'),
    ];
    expect(toServerHits(entries, context())).toEqual([]);
  });

  it('drops hits already in knownHrefs', () => {
    const entries = [
      entryFor('/remote.php/dav/calendars/alice/my%20work/abc.ics'),
      entryFor('/remote.php/dav/calendars/alice/personal/def.ics'),
    ];
    const hits = toServerHits(
      entries,
      context({ knownHrefs: new Set(['/remote.php/dav/calendars/alice/my work/abc.ics']) }),
    );
    expect(hits.map((hit) => hit.href)).toEqual(['https://cloud.test/remote.php/dav/calendars/alice/personal/def.ics']);
  });

  it('drops hits whose calendar fails a calendar token', () => {
    const entries = [
      entryFor('/remote.php/dav/calendars/alice/personal/abc.ics'),
      entryFor('/remote.php/dav/calendars/alice/my%20work/def.ics'),
    ];
    const hits = toServerHits(entries, context({ query: parseQuery('lunch calendar:work') }));
    expect(hits.map((hit) => hit.calendar.id)).toEqual(['work']);
  });

  it('drops a hit whose resource url does not decode', () => {
    expect(toServerHits([entryFor('', { resourceUrl: 'https://cloud.test/apps/calendar/edit/%%%' })], context())).toEqual([]);
  });
});
