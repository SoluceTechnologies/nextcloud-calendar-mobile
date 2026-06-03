import type { Account } from '@/types';

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
