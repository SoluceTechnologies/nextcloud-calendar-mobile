import { fetchSharees, fetchAllContacts } from '../../../src/services/nextcloud/sharees';
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

function calendarResponse(entries: unknown[]) {
  return {
    status: 200,
    ok: true,
    json: async () => entries,
    text: async () => JSON.stringify(entries),
  };
}

function fetchError(status: number) {
  return {
    status,
    ok: false,
    json: async () => ({}),
    text: async () => '',
  };
}

describe('fetchSharees', () => {
  it('returns an empty list for an empty query', async () => {
    const results = await fetchSharees({ account, query: '   ' });
    expect(results).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('calls the calendar attendee endpoint with the search query', async () => {
    mockFetch.mockResolvedValue(calendarResponse([]));

    await fetchSharees({ account, query: 'john' });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://cloud.example.com/apps/calendar/v1/autocompletion/attendee');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ search: 'john' }));
    expect(init.headers).toMatchObject({
      Authorization: 'Basic ' + btoa('john:xxxx'),
      'OCS-APIRequest': 'true',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
  });

  it('falls back to index.php route when the pretty URL returns 404', async () => {
    mockFetch
      .mockResolvedValueOnce(fetchError(404))
      .mockResolvedValueOnce(
        calendarResponse([
          { name: 'John Doe', emails: ['john@example.com'], type: 'individual', source: 'user' },
        ]),
      );

    const results = await fetchSharees({ account, query: 'john' });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toBe('https://cloud.example.com/apps/calendar/v1/autocompletion/attendee');
    expect(mockFetch.mock.calls[1][0]).toBe('https://cloud.example.com/index.php/apps/calendar/v1/autocompletion/attendee');
    expect(results).toEqual([
      { id: 'john@example.com', displayName: 'John Doe', email: 'john@example.com', source: 'user' },
    ]);
  });

  it('parses users and contacts from the calendar response', async () => {
    mockFetch.mockResolvedValue(
      calendarResponse([
        {
          name: 'Jane User',
          emails: ['jane@example.com'],
          type: 'individual',
          source: 'system',
        },
        {
          name: 'John Smith',
          emails: ['john.smith@example.com'],
          type: 'individual',
          source: 'user',
        },
      ]),
    );

    const results = await fetchSharees({ account, query: 'j' });

    expect(results).toEqual([
      { id: 'jane@example.com', displayName: 'Jane User', email: 'jane@example.com', source: 'system' },
      { id: 'john.smith@example.com', displayName: 'John Smith', email: 'john.smith@example.com', source: 'user' },
    ]);
  });

  it('flattens multiple emails and strips mailto: prefix', async () => {
    mockFetch.mockResolvedValue(
      calendarResponse([
        {
          name: 'Multi Email',
          emails: ['mailto:home%40example.com', 'work@example.com'],
          type: 'individual',
          source: 'user',
        },
      ]),
    );

    const results = await fetchSharees({ account, query: 'multi' });

    expect(results).toEqual([
      { id: 'home@example.com', displayName: 'Multi Email', email: 'home@example.com', source: 'user' },
      { id: 'work@example.com', displayName: 'Multi Email', email: 'work@example.com', source: 'user' },
    ]);
  });

  it('skips contact groups and entries without an email address', async () => {
    mockFetch.mockResolvedValue(
      calendarResponse([
        {
          name: 'Group',
          emails: ['mailto:group%40group'],
          type: 'contactsgroup',
          source: 'user',
          members: 5,
        },
        {
          name: 'No Email',
          emails: [],
          type: 'individual',
          source: 'user',
        },
        {
          name: 'Ghost',
          type: 'individual',
          source: 'user',
        },
      ]),
    );

    const results = await fetchSharees({ account, query: 'g' });
    expect(results).toEqual([]);
  });

  it('deduplicates by email (case-insensitive)', async () => {
    mockFetch.mockResolvedValue(
      calendarResponse([
        {
          name: 'John Doe',
          emails: ['John@Example.com'],
          type: 'individual',
          source: 'user',
        },
        {
          name: 'John Doe',
          emails: ['john@example.com'],
          type: 'individual',
          source: 'system',
        },
      ]),
    );

    const results = await fetchSharees({ account, query: 'john' });
    expect(results).toHaveLength(1);
    expect(results[0].email).toBe('John@Example.com');
    expect(results[0].displayName).toBe('John Doe');
  });

  it('applies the limit client-side', async () => {
    mockFetch.mockResolvedValue(
      calendarResponse([
        { name: 'One', emails: ['one@example.com'], type: 'individual', source: 'user' },
        { name: 'Two', emails: ['two@example.com'], type: 'individual', source: 'user' },
        { name: 'Three', emails: ['three@example.com'], type: 'individual', source: 'user' },
      ]),
    );

    const results = await fetchSharees({ account, query: 'x', limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('throws on HTTP error', async () => {
    mockFetch
      .mockResolvedValueOnce(fetchError(404))
      .mockResolvedValueOnce(fetchError(403));

    await expect(fetchSharees({ account, query: 'x' })).rejects.toThrow('fetchSharees HTTP 403');
  });
});

describe('fetchAllContacts', () => {
  it('fetches all contacts with an empty search', async () => {
    mockFetch.mockResolvedValue(
      calendarResponse([
        { name: 'John Doe', emails: ['john@example.com'], type: 'individual', source: 'user' },
        { name: 'Jane Doe', emails: ['jane@example.com'], type: 'individual', source: 'user' },
      ]),
    );

    const results = await fetchAllContacts({ account });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://cloud.example.com/apps/calendar/v1/autocompletion/attendee');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ search: '' }));
    expect(results).toHaveLength(2);
  });

  it('can apply an optional client-side limit', async () => {
    mockFetch.mockResolvedValue(
      calendarResponse([
        { name: 'One', emails: ['one@example.com'], type: 'individual', source: 'user' },
        { name: 'Two', emails: ['two@example.com'], type: 'individual', source: 'user' },
        { name: 'Three', emails: ['three@example.com'], type: 'individual', source: 'user' },
      ]),
    );

    const results = await fetchAllContacts({ account, limit: 2 });
    expect(results).toHaveLength(2);
  });
});

describe('contact photos', () => {
  it('keeps the photo URL returned by the instance', async () => {
    mockFetch.mockResolvedValue(
      calendarResponse([
        {
          name: 'John Doe',
          emails: ['john@example.com'],
          type: 'individual',
          source: 'user',
          photo: 'https://cloud.example.com/remote.php/dav/photo.png',
        },
      ]),
    );

    const results = await fetchSharees({ account, query: 'john' });

    expect(results[0].photoUrl).toBe('https://cloud.example.com/remote.php/dav/photo.png');
  });

  it('applies the entry photo to every email of that contact', async () => {
    mockFetch.mockResolvedValue(
      calendarResponse([
        {
          name: 'John Doe',
          emails: ['home@example.com', 'work@example.com'],
          type: 'individual',
          source: 'user',
          photo: 'https://cloud.example.com/photo.png',
        },
      ]),
    );

    const results = await fetchSharees({ account, query: 'john' });

    expect(results.map((r) => r.photoUrl)).toEqual([
      'https://cloud.example.com/photo.png',
      'https://cloud.example.com/photo.png',
    ]);
  });

  it('leaves photoUrl unset when the contact has no usable photo', async () => {
    mockFetch.mockResolvedValue(
      calendarResponse([
        { name: 'No Photo', emails: ['a@example.com'], type: 'individual', source: 'user', photo: null },
        { name: 'Inline', emails: ['b@example.com'], type: 'individual', source: 'user', photo: 'data:image/png;base64,AAAA' },
      ]),
    );

    const results = await fetchSharees({ account, query: 'x' });

    expect(results[0].photoUrl).toBeUndefined();
    expect(results[1].photoUrl).toBeUndefined();
  });
});
