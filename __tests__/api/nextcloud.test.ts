import { fetchUserInfo } from '../../src/api/nextcloud';
import type { Account } from '../../src/types';

const account: Account = {
  id: 'acc-1',
  displayName: 'Work',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'xxxx-xxxx',
  davUserId: 'john',
};

const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

beforeEach(() => jest.clearAllMocks());

describe('fetchUserInfo', () => {
  it('returns timezone and email from OCS JSON response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ocs: {
          data: {
            timezone: 'Europe/Paris',
            email: 'john@example.com',
          },
        },
      }),
    });

    const result = await fetchUserInfo(account);

    expect(result).toEqual({ timezone: 'Europe/Paris', email: 'john@example.com' });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://cloud.example.com/ocs/v2.php/cloud/users/john',
      expect.objectContaining({
        headers: expect.objectContaining({
          'OCS-APIRequest': 'true',
          'Accept': 'application/json',
        }),
      })
    );
  });

  it('returns empty strings on network error', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));
    const result = await fetchUserInfo(account);
    expect(result).toEqual({ timezone: '', email: '' });
  });

  it('returns empty strings on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    const result = await fetchUserInfo(account);
    expect(result).toEqual({ timezone: '', email: '' });
  });

  it('returns empty strings when OCS data fields are missing', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ocs: { data: {} } }),
    });
    const result = await fetchUserInfo(account);
    expect(result).toEqual({ timezone: '', email: '' });
  });
});
