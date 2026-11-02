import { searchCalendarEvents } from '@/services/nextcloud/search';
import { HttpError } from '@/services/shared/errors';
import type { Account } from '@/types';

const account: Account = {
  id: 'account-1',
  displayName: 'Work',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'xxxx-xxxx',
  davUserId: 'john',
};

const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

function respond(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

beforeEach(() => jest.clearAllMocks());

it('calls the calendar provider with term, limit, since and until', async () => {
  mockFetch.mockResolvedValue(respond({ ocs: { data: { entries: [] } } }));
  await searchCalendarEvents(account, {
    term: 'team lunch',
    since: '2026-11-02T00:00:00.000Z',
    until: '2026-11-09T00:00:00.000Z',
  });
  const [url, init] = mockFetch.mock.calls[0];
  const parsed = new URL(url);
  expect(`${parsed.origin}${parsed.pathname}`).toBe(
    'https://cloud.example.com/ocs/v2.php/search/providers/calendar/search',
  );
  expect(Object.fromEntries(parsed.searchParams)).toEqual({
    term: 'team lunch',
    limit: '30',
    since: '2026-11-02T00:00:00.000Z',
    until: '2026-11-09T00:00:00.000Z',
  });
  expect(init.headers).toEqual(
    expect.objectContaining({
      Authorization: `Basic ${btoa('john:xxxx-xxxx')}`,
      'OCS-APIRequest': 'true',
      Accept: 'application/json',
    }),
  );
});

it('leaves out since and until when absent', async () => {
  mockFetch.mockResolvedValue(respond({ ocs: { data: { entries: [] } } }));
  await searchCalendarEvents(account, { term: 'lunch' }, 10);
  const parsed = new URL(mockFetch.mock.calls[0][0]);
  expect(Object.fromEntries(parsed.searchParams)).toEqual({ term: 'lunch', limit: '10' });
});

it('maps entries and createdAt', async () => {
  mockFetch.mockResolvedValue(
    respond({
      ocs: {
        data: {
          entries: [
            {
              title: 'Team lunch',
              subline: 'Nov 2, 2026 12:00 - 13:00',
              resourceUrl: 'https://cloud.example.com/apps/calendar/edit/abc',
              attributes: { createdAt: '1793620800' },
            },
          ],
        },
      },
    }),
  );
  expect(await searchCalendarEvents(account, { term: 'lunch' })).toEqual([
    {
      title: 'Team lunch',
      subline: 'Nov 2, 2026 12:00 - 13:00',
      resourceUrl: 'https://cloud.example.com/apps/calendar/edit/abc',
      start: new Date(1793620800 * 1000),
    },
  ]);
});

it('start is null without createdAt', async () => {
  mockFetch.mockResolvedValue(
    respond({ ocs: { data: { entries: [{ title: 'Lunch', subline: '', resourceUrl: 'x', attributes: [] }] } } }),
  );
  const [entry] = await searchCalendarEvents(account, { term: 'lunch' });
  expect(entry.start).toBeNull();
});

it('throws on HTTP error', async () => {
  mockFetch.mockResolvedValue({ ok: false, status: 503, headers: { get: () => null } });
  await expect(searchCalendarEvents(account, { term: 'lunch' })).rejects.toBeInstanceOf(HttpError);
});
