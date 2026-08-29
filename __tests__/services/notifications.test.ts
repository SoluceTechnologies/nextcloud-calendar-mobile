import { fetchNotifications, dismissNotification, dismissAllNotifications } from '../../src/services/nextcloud/notifications';
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

describe('dismissAllNotifications', () => {
  it('sends DELETE to the base endpoint', async () => {
    mockTrustedFetch.mockResolvedValue(mockResponse({}));

    await dismissAllNotifications(account);

    const [url, options] = mockTrustedFetch.mock.calls[0];
    expect(url).not.toMatch(/\/notifications\/\d+$/);
    expect(options?.method).toBe('DELETE');
  });
});
