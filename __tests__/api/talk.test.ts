import { createTalkRoom } from '../../src/api/talk';
import type { Account } from '../../src/types';

const account: Account = {
  id: 'acc-1',
  displayName: 'Work',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'xxxx',
  davUserId: 'john',
};

globalThis.fetch = jest.fn() as typeof fetch;
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

beforeEach(() => jest.clearAllMocks());

describe('createTalkRoom', () => {
  it('returns token and url on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ocs: {
          meta: { statuscode: 200 },
          data: { token: 'abc123' },
        },
      }),
    } as Response);

    const result = await createTalkRoom(account, 'Team Sync');
    expect(result.token).toBe('abc123');
    expect(result.url).toBe('https://cloud.example.com/call/abc123');
  });

  it('sends correct headers and body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ocs: { meta: { statuscode: 200 }, data: { token: 'tok' } } }),
    } as Response);

    await createTalkRoom(account, 'My Room');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://cloud.example.com/ocs/v2.php/apps/spreed/api/v4/room',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'OCS-APIREQUEST': 'true',
          'Content-Type': 'application/json',
          Authorization: expect.stringContaining('Basic '),
        }),
        body: JSON.stringify({ roomType: 2, roomName: 'My Room' }),
      })
    );
  });

  it('throws when statuscode is not 200/201', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ocs: { meta: { statuscode: 400, message: 'Bad Request' }, data: {} } }),
    } as Response);

    await expect(createTalkRoom(account, 'Room')).rejects.toThrow('Talk API error 400');
  });

  it('throws when fetch fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' } as Response);
    await expect(createTalkRoom(account, 'Room')).rejects.toThrow();
  });
});
