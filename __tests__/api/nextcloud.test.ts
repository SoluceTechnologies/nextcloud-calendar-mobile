// __tests__/api/nextcloud.test.ts
import { fetchUserInfo, fetchThemingCapabilities, updateUserPrimaryColor } from '../../src/api/nextcloud';
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

describe('fetchThemingCapabilities', () => {
  it('returns color and userEditable from capabilities', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ocs: {
          data: {
            capabilities: {
              theming: {
                color: '#ff0000',
                user_editable: true,
              },
            },
          },
        },
      }),
    });

    const result = await fetchThemingCapabilities(account);

    expect(result).toEqual({ color: '#ff0000', userEditable: true });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://cloud.example.com/ocs/v2.php/cloud/capabilities',
      expect.any(Object)
    );
  });

  it('returns default color and false editable on failure', async () => {
    mockFetch.mockResolvedValue({ ok: false });
    const result = await fetchThemingCapabilities(account);
    expect(result).toEqual({ color: '#0082c9', userEditable: false });
  });
});

describe('updateUserPrimaryColor', () => {
  it('sends PUT request with color value', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const result = await updateUserPrimaryColor(account, '#00ff00');

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://cloud.example.com/ocs/v2.php/cloud/users/john/setting/theming/color',
      expect.objectContaining({
        method: 'PUT',
        body: 'value=%2300ff00',
      })
    );
  });

  it('returns false on error', async () => {
    mockFetch.mockRejectedValue(new Error('fail'));
    const result = await updateUserPrimaryColor(account, '#00ff00');
    expect(result).toBe(false);
  });
});
