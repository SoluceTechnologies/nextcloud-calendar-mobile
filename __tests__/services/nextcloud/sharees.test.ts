import { fetchSharees } from '../../../src/services/nextcloud/sharees';
import type { Account } from '../../../src/types';

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

function shareesResponse(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    ocs: {
      meta: { status: 'ok' },
      data: {
        exact: { users: [], emails: [] },
        users: [],
        emails: [],
        ...extra,
      },
    },
  });
}

describe('fetchSharees', () => {
  it('returns an empty list for an empty query', async () => {
    const results = await fetchSharees({ account, query: '   ' });
    expect(results).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('calls the Nextcloud sharees endpoint with the search query', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => JSON.parse(shareesResponse()),
      text: async () => shareesResponse(),
    });

    await fetchSharees({ account, query: 'john' });

    const call = mockFetch.mock.calls[0];
    expect(call[0]).toContain('/ocs/v2.php/apps/files_sharing/api/v1/sharees?');
    expect(call[0]).toContain('search=john');
    expect(call[0]).toContain('itemType=call');
    expect(call[0]).toContain('perPage=25');
    expect(call[1].headers).toMatchObject({
      Authorization: 'Basic ' + btoa('john:xxxx'),
      'OCS-APIRequest': 'true',
      Accept: 'application/json',
    });
  });

  it('extracts users and contacts from the sharees response', async () => {
    const response = JSON.stringify({
      ocs: {
        meta: { status: 'ok' },
        data: {
          exact: { users: [], emails: [] },
          users: [
            {
              label: 'Jane Doe (jane.doe@example.com)',
              value: { shareType: 0, shareWith: 'jane.doe@example.com' },
            },
          ],
          emails: [
            {
              label: 'John Smith (john.smith@example.com)',
              name: 'John Smith',
              uuid: 'contact-1',
              value: { shareType: 4, shareWith: 'john.smith@example.com' },
            },
          ],
        },
      },
    });

    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => JSON.parse(response),
      text: async () => response,
    });

    const results = await fetchSharees({ account, query: 'jo' });

    expect(results).toEqual([
      { id: 'jane.doe@example.com', displayName: 'Jane Doe', email: 'jane.doe@example.com', source: 'users' },
      {
        id: 'john.smith@example.com',
        displayName: 'John Smith',
        email: 'john.smith@example.com',
        source: 'emails',
      },
    ]);
  });

  it('skips entries without an email address', async () => {
    const response = JSON.stringify({
      ocs: {
        meta: { status: 'ok' },
        data: {
          exact: { users: [], emails: [] },
          users: [{ label: 'Ghost', value: { shareType: 0 } }],
          emails: [],
        },
      },
    });

    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => JSON.parse(response),
      text: async () => response,
    });

    const results = await fetchSharees({ account, query: 'g' });
    expect(results).toEqual([]);
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValue({
      status: 403,
      ok: false,
      json: async () => ({}),
      text: async () => '',
    });

    await expect(fetchSharees({ account, query: 'x' })).rejects.toThrow('fetchSharees HTTP 403');
  });
});
