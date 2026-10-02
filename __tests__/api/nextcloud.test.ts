import { fetchUserInfo, exchangeOneTimeToken } from '../../src/services/nextcloud/nextcloud';
import { HttpError } from '../../src/services/shared/errors';
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
            displayname: 'John Doe',
          },
        },
      }),
    });

    const result = await fetchUserInfo(account);

    expect(result).toEqual({ timezone: 'Europe/Paris', email: 'john@example.com', displayName: 'John Doe' });
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
    expect(result).toEqual({ timezone: '', email: '', displayName: '' });
  });

  it('returns empty strings on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    const result = await fetchUserInfo(account);
    expect(result).toEqual({ timezone: '', email: '', displayName: '' });
  });

  it('returns empty strings when OCS data fields are missing', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ocs: { data: {} } }),
    });
    const result = await fetchUserInfo(account);
    expect(result).toEqual({ timezone: '', email: '', displayName: '' });
  });
});

describe('exchangeOneTimeToken', () => {
  const params = {
    baseUrl: 'https://cloud.example.com',
    username: 'john',
    oneTimeToken: 'one-time-abc',
  };

  it('trades the one-time token for a permanent app password', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ocs: { data: { apppassword: 'perm-xyz' } } }),
    });

    await expect(exchangeOneTimeToken(params)).resolves.toBe('perm-xyz');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://cloud.example.com/ocs/v2.php/core/getapppassword-onetime',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Basic ' + btoa('john:one-time-abc'),
          'OCS-APIRequest': 'true',
        }),
      })
    );
  });

  it('throws HttpError when the token is already used or expired', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => null },
      json: async () => ({}),
    });

    await expect(exchangeOneTimeToken(params)).rejects.toBeInstanceOf(HttpError);
  });

  it('throws when the response carries no app password', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ocs: { data: {} } }),
    });

    await expect(exchangeOneTimeToken(params)).rejects.toThrow(/apppassword/i);
  });
});
