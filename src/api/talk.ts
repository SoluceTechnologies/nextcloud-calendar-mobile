import type { Account } from '@/types';

export interface TalkRoom {
  token: string;
  url: string;
}

export async function createTalkRoom(account: Account, name: string): Promise<TalkRoom> {
  const credentials = btoa(`${account.username}:${account.appPassword}`);
  const endpoint = `${account.baseUrl}/ocs/v2.php/apps/spreed/api/v4/room`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'OCS-APIREQUEST': 'true',
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify({ roomType: 3, roomName: name }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Talk request failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  const meta = data?.ocs?.meta;
  const statuscode = meta?.statuscode;

  if (statuscode !== 200 && statuscode !== 201) {
    throw new Error(`Talk API error ${statuscode}: ${meta?.message ?? 'unknown'}`);
  }

  const token: string = data.ocs.data.token;
  return { token, url: `${account.baseUrl}/call/${token}` };
}
