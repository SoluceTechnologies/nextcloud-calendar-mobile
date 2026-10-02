import * as Notifications from 'expo-notifications';

import { trustedFetch } from '@/services/shared/trustedFetch';
import { generatePushKeyPair, sha512, type PushKeyPair } from './pushCrypto';
import type { Account } from '@/types';

const PROXY_URL = 'https://push-notifications.nextcloud.com/devices';
const NC_PROXY = 'https://push-notifications.nextcloud.com';

export interface PushRegistration {
  token: string;
  tokenHash: string;
  keys: PushKeyPair;
  deviceIdentifier: string;
  deviceIdentifierSignature: string;
  userPublicKey: string;
}

let keyPairCache: PushKeyPair | null = null;

export async function isPushAvailable(account: Account): Promise<boolean> {
  const res = await trustedFetch(
    `${account.baseUrl}/ocs/v2.php/cloud/capabilities`,
    {
      headers: {
        Authorization: 'Basic ' + btoa(`${account.username}:${account.appPassword}`),
        'OCS-APIRequest': 'true',
        Accept: 'application/json',
      },
    },
  );
  if (!res.ok) return false;
  const json = (await res.json()) as {
    ocs?: { data?: { capabilities?: { notifications?: { 'push-notifications'?: boolean } } } };
  };
  return Boolean(json?.ocs?.data?.capabilities?.notifications?.['push-notifications']);
}

export async function getOrCreatePushKeys(): Promise<PushKeyPair> {
  if (keyPairCache) return keyPairCache;
  keyPairCache = await generatePushKeyPair();
  return keyPairCache;
}

export async function getPushToken(): Promise<string> {
  const { data } = await Notifications.getDevicePushTokenAsync();
  if (!data) throw new Error('No push token available');
  // iOS APNs tokens and FCM tokens both come as strings.
  return data;
}

async function registerWithNextcloud(
  account: Account,
  tokenHash: string,
  publicKey: string,
): Promise<{
  publicKey: string;
  deviceIdentifier: string;
  signature: string;
}> {
  const bodyV2 = JSON.stringify({
    pushTokenHash: tokenHash,
    devicePublicKey: publicKey,
    proxyServer: NC_PROXY,
  });

  const v2Res = await trustedFetch(
    `${account.baseUrl}/ocs/v2.php/apps/notifications/api/v2/push`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${account.username}:${account.appPassword}`),
        'OCS-APIRequest': 'true',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: bodyV2,
    },
  );

  if (v2Res.ok) {
    const json = (await v2Res.json()) as {
      ocs?: { data?: { publicKey?: string; deviceIdentifier?: string; signature?: string } };
    };
    return {
      publicKey: json?.ocs?.data?.publicKey ?? '',
      deviceIdentifier: json?.ocs?.data?.deviceIdentifier ?? '',
      signature: json?.ocs?.data?.signature ?? '',
    };
  }

  if (v2Res.status === 400) {
    // Some servers reject v2 because of proxyServer validation; try v3.
    const v3Res = await trustedFetch(
      `${account.baseUrl}/ocs/v2.php/apps/notifications/api/v3/push`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + btoa(`${account.username}:${account.appPassword}`),
          'OCS-APIRequest': 'true',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ pushTokenHash: tokenHash, devicePublicKey: publicKey }),
      },
    );
    if (!v3Res.ok) {
      const error = await v3Res.text().catch(() => 'unknown');
      throw new Error(`[registerPushNotifications] v3 server HTTP ${v3Res.status}: ${error}`);
    }
    const json = (await v3Res.json()) as {
      ocs?: { data?: { publicKey?: string; deviceIdentifier?: string; signature?: string } };
    };
    return {
      publicKey: json?.ocs?.data?.publicKey ?? '',
      deviceIdentifier: json?.ocs?.data?.deviceIdentifier ?? '',
      signature: json?.ocs?.data?.signature ?? '',
    };
  }

  const error = await v2Res.text().catch(() => 'unknown');
  throw new Error(`[registerPushNotifications] v2 server HTTP ${v2Res.status}: ${error}`);
}

export async function registerPushNotifications(account: Account): Promise<PushRegistration | null> {
  const token = await getPushToken();
  const tokenHash = await sha512(token);
  const keys = await getOrCreatePushKeys();

  const { publicKey, deviceIdentifier, signature } = await registerWithNextcloud(account, tokenHash, keys.publicKey);

  if (!publicKey || !deviceIdentifier || !signature) {
    throw new Error('[registerPushNotifications] missing server registration data');
  }

  // Register at push proxy.
  const proxyRes = await trustedFetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pushToken: token,
      deviceIdentifier,
      deviceIdentifierSignature: signature,
      userPublicKey: publicKey,
    }),
  });

  if (!proxyRes.ok) {
    const error = await proxyRes.text().catch(() => 'unknown');
    throw new Error(`[registerPushNotifications] proxy HTTP ${proxyRes.status}: ${error}`);
  }

  return {
    token,
    tokenHash,
    keys,
    deviceIdentifier,
    deviceIdentifierSignature: signature,
    userPublicKey: publicKey,
  };
}

export async function unregisterPushNotifications(account: Account): Promise<void> {
  const res = await trustedFetch(
    `${account.baseUrl}/ocs/v2.php/apps/notifications/api/v2/push`,
    {
      method: 'DELETE',
      headers: {
        Authorization: 'Basic ' + btoa(`${account.username}:${account.appPassword}`),
        'OCS-APIRequest': 'true',
        Accept: 'application/json',
      },
    },
  );

  if (!res.ok) {
    throw new Error(`[unregisterPushNotifications] HTTP ${res.status}`);
  }
}
