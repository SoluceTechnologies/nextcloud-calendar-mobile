import type { Account, ServerCapabilities } from '@/types';

function basicAuth(account: Pick<Account, 'username' | 'appPassword'>): string {
  return 'Basic ' + btoa(`${account.username}:${account.appPassword}`);
}

export async function fetchUserInfo(
  account: Pick<Account, 'baseUrl' | 'username' | 'appPassword' | 'davUserId'>
): Promise<{ timezone: string; email: string }> {
  try {
    const url = `${account.baseUrl}/ocs/v2.php/cloud/users/${encodeURIComponent(account.davUserId)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: basicAuth(account),
        'OCS-APIRequest': 'true',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return { timezone: '', email: '' };
    const json = await res.json();
    const data = json?.ocs?.data;
    return {
      timezone: (data?.timezone as string) || '',
      email: (data?.email as string) || '',
    };
  } catch {
    return { timezone: '', email: '' };
  }
}

/**
 * Query the Nextcloud capabilities endpoint to check which apps are enabled.
 * Returns defaults (disabled) on any network/parse error so the app never crashes
 * because of a failed capability check.
 */
export async function fetchCapabilities(
  account: Pick<Account, 'baseUrl' | 'username' | 'appPassword'>
): Promise<ServerCapabilities> {
  try {
    const url = `${account.baseUrl}/ocs/v2.php/cloud/capabilities`;
    const res = await fetch(url, {
      headers: {
        Authorization: basicAuth(account),
        'OCS-APIRequest': 'true',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return { calendarEnabled: true, talkEnabled: false };
    const json = await res.json();
    const apps: Record<string, unknown> = json?.ocs?.data?.capabilities ?? {};

    // The calendar app exposes its capabilities under the "dav" key (CalDAV is always present
    // if the calendar app is enabled). Talk exposes its capabilities under "spreed".
    const calendarEnabled = 'dav' in apps || 'calendar' in apps;
    const talkEnabled = 'spreed' in apps;

    return { calendarEnabled, talkEnabled };
  } catch {
    return { calendarEnabled: true, talkEnabled: false };
  }
}
