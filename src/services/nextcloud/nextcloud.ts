import type { Account, CalendarAppStatus, ServerCapabilities } from '@/types';
import { httpErrorFrom } from '../shared/errors';
import { trustedFetch } from '../shared/trustedFetch';

function basicAuth(account: Pick<Account, 'username' | 'appPassword'>): string {
  return 'Basic ' + btoa(`${account.username}:${account.appPassword}`);
}

export async function exchangeOneTimeToken(params: {
  baseUrl: string;
  username: string;
  oneTimeToken: string;
}): Promise<string> {
  const url = `${params.baseUrl}/ocs/v2.php/core/getapppassword-onetime`;
  const res = await trustedFetch(url, {
    headers: {
      Authorization: 'Basic ' + btoa(`${params.username}:${params.oneTimeToken}`),
      'OCS-APIRequest': 'true',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw httpErrorFrom(res, 'exchangeOneTimeToken');

  const json = await res.json();
  const appPassword = json?.ocs?.data?.apppassword;
  if (typeof appPassword !== 'string' || !appPassword) {
    throw new Error('exchangeOneTimeToken: response carried no apppassword');
  }
  return appPassword;
}

export async function fetchUserInfo(
  account: Pick<Account, 'baseUrl' | 'username' | 'appPassword' | 'davUserId'>
): Promise<{ timezone: string; email: string; displayName: string }> {
  try {
    const url = `${account.baseUrl}/ocs/v2.php/cloud/users/${encodeURIComponent(account.davUserId)}`;
    const res = await trustedFetch(url, {
      headers: {
        Authorization: basicAuth(account),
        'OCS-APIRequest': 'true',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return { timezone: '', email: '', displayName: '' };
    const json = await res.json();
    const data = json?.ocs?.data;
    return {
      timezone: (data?.timezone as string) || '',
      email: (data?.email as string) || '',
      displayName: (data?.displayname as string) || (data?.['display-name'] as string) || '',
    };
  } catch {
    return { timezone: '', email: '', displayName: '' };
  }
}

export async function fetchCalendarApp(
  account: Pick<Account, 'baseUrl' | 'username' | 'appPassword'>
): Promise<CalendarAppStatus> {
  try {
    const url = `${account.baseUrl}/ocs/v2.php/core/navigation/apps`;
    const res = await trustedFetch(url, {
      headers: {
        Authorization: basicAuth(account),
        'OCS-APIRequest': 'true',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return 'unknown';
    const json = await res.json();
    const apps = json?.ocs?.data;
    if (!Array.isArray(apps)) return 'unknown';
    return apps.some((a) => a?.id === 'calendar') ? 'available' : 'unconfigured';
  } catch {
    return 'unknown';
  }
}

async function fetchServerCaps(
  account: Pick<Account, 'baseUrl' | 'username' | 'appPassword'>
): Promise<Omit<ServerCapabilities, 'calendarApp'>> {
  try {
    const url = `${account.baseUrl}/ocs/v2.php/cloud/capabilities`;
    const res = await trustedFetch(url, {
      headers: {
        Authorization: basicAuth(account),
        'OCS-APIRequest': 'true',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return { talkEnabled: false };
    const json = await res.json();
    const apps: Record<string, unknown> = json?.ocs?.data?.capabilities ?? {};

    return { talkEnabled: 'spreed' in apps };
  } catch {
    return { talkEnabled: false };
  }
}

export async function fetchCapabilities(
  account: Pick<Account, 'baseUrl' | 'username' | 'appPassword'>
): Promise<ServerCapabilities> {
  const [caps, calendarApp] = await Promise.all([
    fetchServerCaps(account),
    fetchCalendarApp(account),
  ]);
  return { ...caps, calendarApp };
}
