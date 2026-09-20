import { httpErrorFrom } from '../shared/errors';
import { trustedFetch } from '../shared/trustedFetch';
import type { FilesAccount } from './files';

function basicAuth(account: Pick<FilesAccount, 'username' | 'appPassword'>): string {
  return 'Basic ' + btoa(`${account.username}:${account.appPassword}`);
}

export type PublicLinkShare = {
  /** Public URL written into ATTACH — `<base>/s/<token>`. */
  url: string;
  token: string;
  /** OCS share id — needed to delete the share later. */
  id: number;
};

/**
 * Creates a read-only public link share for a file in the account's Files
 * space (OCS `shareType: 3`). This is the mechanism the Nextcloud Calendar
 * web app uses so that event attendees can open attachments: the resulting
 * `/s/<token>` link works anonymously, unlike a private DAV URL.
 */
export async function createPublicLinkShare(
  account: FilesAccount,
  path: string,
): Promise<PublicLinkShare> {
  const res = await trustedFetch(
    `${account.baseUrl.replace(/\/+$/, '')}/ocs/v2.php/apps/files_sharing/api/v1/shares`,
    {
      method: 'POST',
      headers: {
        Authorization: basicAuth(account),
        'OCS-APIRequest': 'true',
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      // shareType 3 = public link, permissions 1 = read only.
      body: `path=${encodeURIComponent(path)}&shareType=3&permissions=1`,
      timeoutMs: 30000,
      maxRetries: 1,
    },
  );
  if (!res.ok) throw httpErrorFrom(res, 'createPublicLinkShare');
  const json: unknown = await res.json();
  const data = (json as { ocs?: { data?: Record<string, unknown> } })?.ocs?.data;
  const token = typeof data?.token === 'string' ? data.token : '';
  const url = typeof data?.url === 'string' ? data.url : '';
  const id = Number(data?.id);
  if (!token || !url) throw new Error('createPublicLinkShare: malformed OCS response');
  return { url, token, id };
}
