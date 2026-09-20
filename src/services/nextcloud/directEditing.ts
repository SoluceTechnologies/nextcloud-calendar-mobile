import { httpErrorFrom } from '../shared/errors';
import { trustedFetch } from '../shared/trustedFetch';
import type { FilesAccount } from './files';

function basicAuth(account: Pick<FilesAccount, 'username' | 'appPassword'>): string {
  return 'Basic ' + btoa(`${account.username}:${account.appPassword}`);
}

function ocsHeaders(account: FilesAccount): Record<string, string> {
  return {
    Authorization: basicAuth(account),
    'OCS-APIRequest': 'true',
    Accept: 'application/json',
  };
}

export type DirectEditor = {
  id: string;
  name: string;
  mimetypes: string[];
  optionalMimetypes: string[];
};

/**
 * Editors registered for the Direct Editing API (Nextcloud Text, Collabora,
 * OnlyOffice…). Empty when the server has none or the API is unavailable.
 */
export async function fetchDirectEditors(
  account: FilesAccount,
): Promise<DirectEditor[]> {
  const res = await trustedFetch(
    `${account.baseUrl.replace(/\/+$/, '')}/ocs/v2.php/apps/files/api/v1/directEditing`,
    {
      method: 'GET',
      headers: ocsHeaders(account),
      timeoutMs: 30000,
      maxRetries: 1,
    },
  );
  if (!res.ok) throw httpErrorFrom(res, 'fetchDirectEditors');
  const json: unknown = await res.json();
  const editors = (json as { ocs?: { data?: { editors?: Record<string, unknown> } } })
    ?.ocs?.data?.editors;
  if (!editors || typeof editors !== 'object') return [];
  return Object.values(editors).map((e) => {
    const ed = e as Record<string, unknown>;
    return {
      id: String(ed.id ?? ''),
      name: String(ed.name ?? ''),
      mimetypes: Array.isArray(ed.mimetypes) ? (ed.mimetypes as string[]) : [],
      optionalMimetypes: Array.isArray(ed.optionalMimetypes)
        ? (ed.optionalMimetypes as string[])
        : [],
    };
  });
}

/** First editor advertising support for the given MIME type. */
export function editorForMime(
  editors: DirectEditor[],
  mime?: string,
): DirectEditor | null {
  if (!mime) return null;
  return (
    editors.find(
      (e) => e.mimetypes.includes(mime) || e.optionalMimetypes.includes(mime),
    ) ?? null
  );
}

/**
 * Asks the server for a one-time Direct Editing URL for a file (user-relative
 * Files path like `/Calendar/doc.md`). Opening it in a browser loads the
 * matching editor already authenticated.
 */
export async function openDirectEditingUrl(
  account: FilesAccount,
  path: string,
  editorId?: string,
): Promise<string> {
  const res = await trustedFetch(
    `${account.baseUrl.replace(/\/+$/, '')}/ocs/v2.php/apps/files/api/v1/directEditing/open`,
    {
      method: 'POST',
      headers: {
        ...ocsHeaders(account),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body:
        `path=${encodeURIComponent(path)}` +
        (editorId ? `&editorId=${encodeURIComponent(editorId)}` : ''),
      timeoutMs: 30000,
      maxRetries: 1,
    },
  );
  if (!res.ok) throw httpErrorFrom(res, 'openDirectEditingUrl');
  const json: unknown = await res.json();
  const url = (json as { ocs?: { data?: { url?: unknown } } })?.ocs?.data?.url;
  if (typeof url !== 'string' || !url) {
    throw new Error('openDirectEditingUrl: malformed OCS response');
  }
  return url;
}
