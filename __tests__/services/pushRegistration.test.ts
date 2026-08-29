import * as Notifications from 'expo-notifications';

import { registerPushNotifications, unregisterPushNotifications, isPushAvailable } from '@/services/push/pushRegistration';
import * as pushCrypto from '@/services/push/pushCrypto';
import { trustedFetch } from '@/services/shared/trustedFetch';

jest.mock('expo-notifications', () => ({
  getDevicePushTokenAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  setBadgeCountAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  dismissAllNotificationsAsync: jest.fn(),
}));

jest.mock('@/services/shared/trustedFetch', () => ({
  trustedFetch: jest.fn(),
}));

jest.mock('@/services/push/pushCrypto', () => ({
  generatePushKeyPair: jest.fn(() =>
    Promise.resolve({ publicKey: 'pub', privateKey: 'priv' }),
  ),
  sha512: jest.fn((s: string) => Promise.resolve(`sha512-${s}`)),
}));

const account = {
  id: '1',
  baseUrl: 'https://cloud.example.com',
  username: 'admin',
  appPassword: 'app-pass',
  displayName: 'Admin',
  davUserId: 'admin',
};

const mockTrustedFetch = trustedFetch as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isPushAvailable', () => {
  it('returns true when the server advertises push-notifications support', async () => {
    mockTrustedFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ocs: {
            data: {
              capabilities: {
                notifications: { 'push-notifications': true },
              },
            },
          },
        }),
    });

    await expect(isPushAvailable(account)).resolves.toBe(true);
    expect(mockTrustedFetch).toHaveBeenCalledWith(
      'https://cloud.example.com/ocs/v2.php/cloud/capabilities',
      expect.objectContaining({
        headers: expect.objectContaining({ 'OCS-APIRequest': 'true' }),
      }),
    );
  });

  it('returns false on non-ok response', async () => {
    mockTrustedFetch.mockResolvedValue({ ok: false });
    await expect(isPushAvailable(account)).resolves.toBe(false);
  });
});

describe('registerPushNotifications', () => {
  it('registers through v2 and then the push proxy', async () => {
    (Notifications.getDevicePushTokenAsync as jest.Mock).mockResolvedValue({ data: 'fcm-token' });

    mockTrustedFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ocs: {
              data: {
                publicKey: 'server-pub',
                deviceIdentifier: 'device-id',
                signature: 'sig',
              },
            },
          }),
      })
      .mockResolvedValueOnce({ ok: true });

    const result = await registerPushNotifications(account);

    expect(result).toMatchObject({
      token: 'fcm-token',
      deviceIdentifier: 'device-id',
      deviceIdentifierSignature: 'sig',
      userPublicKey: 'server-pub',
    });

    expect(mockTrustedFetch).toHaveBeenCalledWith(
      'https://cloud.example.com/ocs/v2.php/apps/notifications/api/v2/push',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('fcm-token'),
      }),
    );

    expect(mockTrustedFetch).toHaveBeenCalledWith(
      'https://push-notifications.nextcloud.com/devices',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('device-id'),
      }),
    );
  });

  it('falls back to v3 when v2 returns 400', async () => {
    (Notifications.getDevicePushTokenAsync as jest.Mock).mockResolvedValue({ data: 'apns-token' });

    mockTrustedFetch
      .mockResolvedValueOnce({ ok: false, status: 400 })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ocs: {
              data: {
                publicKey: 'server-pub',
                deviceIdentifier: 'device-id',
                signature: 'sig',
              },
            },
          }),
      })
      .mockResolvedValueOnce({ ok: true });

    const result = await registerPushNotifications(account);

    expect(result).toMatchObject({ token: 'apns-token' });
    expect(mockTrustedFetch).toHaveBeenCalledWith(
      'https://cloud.example.com/ocs/v2.php/apps/notifications/api/v3/push',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('unregisterPushNotifications', () => {
  it('sends a DELETE to the push endpoint', async () => {
    mockTrustedFetch.mockResolvedValue({ ok: true });

    await unregisterPushNotifications(account);

    expect(mockTrustedFetch).toHaveBeenCalledWith(
      'https://cloud.example.com/ocs/v2.php/apps/notifications/api/v2/push',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
