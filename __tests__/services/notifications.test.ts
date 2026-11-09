import { fetchNotifications, dismissNotification, dismissAllNotifications } from '../../src/services/nextcloud/notifications';
import { resolveNotificationLink } from '../../src/services/push/links';
import { trustedFetch, type TrustedResponse } from '../../src/services/shared/trustedFetch';

jest.mock('../../src/services/shared/trustedFetch');

const mockTrustedFetch = trustedFetch as jest.MockedFunction<typeof trustedFetch>;

const account = {
  id: 'acc-1',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'secret',
};

const sampleResponse = {
  ocs: {
    data: [
      {
        notification_id: 42,
        app: 'calendar',
        user: 'john',
        datetime: '2026-08-28T12:00:00+00:00',
        object_type: 'event',
        object_id: 'evt-1',
        subject: 'Event updated',
        message: 'The event "Team meeting" was updated',
        link: 'https://cloud.example.com/apps/calendar/day?event=evt-1',
        subjectRich: 'Event updated',
        subjectRichParameters: {},
        messageRich: 'The event "Team meeting" was updated',
        messageRichParameters: {},
        icon: 'https://cloud.example.com/apps/calendar/img/calendar.svg',
        shouldNotify: true,
        actions: [],
      },
    ],
  },
};

function mockResponse(overrides: Partial<TrustedResponse>): TrustedResponse {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => '',
    arrayBuffer: async () => new ArrayBuffer(0),
    base64: async () => '',
    json: async () => ({}),
    ...overrides,
  } as TrustedResponse;
}

beforeEach(() => {
  mockTrustedFetch.mockReset();
});

describe('fetchNotifications', () => {
  it('returns parsed notifications', async () => {
    mockTrustedFetch.mockResolvedValue(
      mockResponse({ json: async () => sampleResponse }),
    );

    const result = await fetchNotifications(account);

    expect(result).toHaveLength(1);
    expect(result[0].notificationId).toBe(42);
    expect(result[0].app).toBe('calendar');
    expect(result[0].subject).toBe('Event updated');

    const [url, options] = mockTrustedFetch.mock.calls[0];
    expect(url).toContain('/ocs/v2.php/apps/notifications/api/v2/notifications');
    const headers = options?.headers as Record<string, string> | undefined;
    expect(headers?.['OCS-APIRequest']).toBe('true');
  });

  it('throws on non-200 response', async () => {
    mockTrustedFetch.mockResolvedValue(mockResponse({ ok: false, status: 401 }));

    await expect(fetchNotifications(account)).rejects.toThrow('HTTP 401');
  });

  it('normalizes relative notification and action links against baseUrl', async () => {
    const relative = {
      ocs: {
        data: [
          {
            ...sampleResponse.ocs.data[0],
            link: '/apps/calendar/day?event=evt-1',
            actions: [
              { label: 'Open', link: 'apps/calendar/day', type: 'GET', primary: true },
              { label: 'Dismiss', link: 'index.php/apps/notifications/dismiss', type: 'POST', primary: false },
            ],
          },
        ],
      },
    };
    mockTrustedFetch.mockResolvedValue(mockResponse({ json: async () => relative }));

    const result = await fetchNotifications(account);

    expect(result[0].link).toBe('https://cloud.example.com/apps/calendar/day?event=evt-1');
    expect(result[0].actions[0].link).toBe('https://cloud.example.com/apps/calendar/day');
    expect(result[0].actions[1].link).toBe(
      'https://cloud.example.com/index.php/apps/notifications/dismiss',
    );
  });

  it('keeps absolute and empty links untouched', async () => {
    mockTrustedFetch.mockResolvedValue(
      mockResponse({ json: async () => sampleResponse }),
    );

    const result = await fetchNotifications(account);
    expect(result[0].link).toBe('https://cloud.example.com/apps/calendar/day?event=evt-1');

    const noLink = {
      ocs: { data: [{ ...sampleResponse.ocs.data[0], link: '' }] },
    };
    mockTrustedFetch.mockResolvedValue(mockResponse({ json: async () => noLink }));
    const result2 = await fetchNotifications(account);
    expect(result2[0].link).toBe('');
  });
});

describe('dismissNotification', () => {
  it('sends DELETE to the notification endpoint', async () => {
    mockTrustedFetch.mockResolvedValue(mockResponse({}));

    await dismissNotification(account, 42);

    const [url, options] = mockTrustedFetch.mock.calls[0];
    expect(url).toContain('/notifications/42');
    expect(options?.method).toBe('DELETE');
  });
});

describe('resolveNotificationLink', () => {
  const base = 'https://cloud.example.com';

  it.each([
    ['https://a.example.com/x', 'https://a.example.com/x'],
    ['http://a.example.com/x', 'http://a.example.com/x'],
    ['//a.example.com/x', 'https://a.example.com/x'],
    ['/apps/calendar/day', 'https://cloud.example.com/apps/calendar/day'],
    ['apps/calendar/day', 'https://cloud.example.com/apps/calendar/day'],
    ['index.php/apps/x', 'https://cloud.example.com/index.php/apps/x'],
    ['', ''],
  ])('resolves %j', (input, expected) => {
    expect(resolveNotificationLink(input, base)).toBe(expected);
  });

  it('strips a trailing slash on baseUrl before joining', () => {
    expect(resolveNotificationLink('/apps/x', `${base}/`)).toBe(`${base}/apps/x`);
  });
});

describe('dismissAllNotifications', () => {
  it('sends DELETE to the base endpoint', async () => {
    mockTrustedFetch.mockResolvedValue(mockResponse({}));

    await dismissAllNotifications(account);

    const [url, options] = mockTrustedFetch.mock.calls[0];
    expect(url).not.toMatch(/\/notifications\/\d+$/);
    expect(options?.method).toBe('DELETE');
  });
});
