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

export type DirectCreator = {
  id: string;
  editor: string;
  name: string;
  extension: string;
  mimetype: string;
  templates: boolean;
};

export type DirectEditingCapabilities = {
  editors: DirectEditor[];
  creators: DirectCreator[];
};

/**
 * Editors and creators registered for the Direct Editing API (Nextcloud Text,
 * Collabora, OnlyOffice…). Empty lists when the server has none or the API is
 * unavailable.
 */
export async function fetchDirectEditing(
  account: FilesAccount,
): Promise<DirectEditingCapabilities> {
  const res = await trustedFetch(
    `${account.baseUrl.replace(/\/+$/, '')}/ocs/v2.php/apps/files/api/v1/directEditing`,
    {
      method: 'GET',
      headers: ocsHeaders(account),
      timeoutMs: 30000,
      maxRetries: 1,
    },
  );
  if (!res.ok) throw httpErrorFrom(res, 'fetchDirectEditing');
  const json: unknown = await res.json();
  const data = (json as {
    ocs?: { data?: { editors?: Record<string, unknown>; creators?: Record<string, unknown> } };
  })?.ocs?.data;
  const editors =
    data?.editors && typeof data.editors === 'object'
      ? Object.values(data.editors).map((e) => {
          const ed = e as Record<string, unknown>;
          return {
            id: String(ed.id ?? ''),
            name: String(ed.name ?? ''),
            mimetypes: Array.isArray(ed.mimetypes) ? (ed.mimetypes as string[]) : [],
            optionalMimetypes: Array.isArray(ed.optionalMimetypes)
              ? (ed.optionalMimetypes as string[])
              : [],
          };
        })
      : [];
  const creators =
    data?.creators && typeof data.creators === 'object'
      ? Object.values(data.creators).map((c) => {
          const cr = c as Record<string, unknown>;
          return {
            id: String(cr.id ?? ''),
            editor: String(cr.editor ?? ''),
            name: String(cr.name ?? ''),
            extension: String(cr.extension ?? ''),
            mimetype: String(cr.mimetype ?? ''),
            templates: cr.templates === true,
          };
        })
      : [];
  return { editors, creators };
}

/** Convenience wrapper for callers that only need the editors list. */
export async function fetchDirectEditors(
  account: FilesAccount,
): Promise<DirectEditor[]> {
  return (await fetchDirectEditing(account)).editors;
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
 * Editors that need a mobile office user agent to serve their touch-friendly
 * UI — mirrors `EditorUtils.OFFICE_EDITOR_IDS` in nextcloud/android
 * (Collabora/`richdocuments` does NOT need one).
 */
const OFFICE_EDITOR_IDS = new Set(['onlyoffice', 'eurooffice']);

export function usesOfficeUserAgent(editorId?: string): boolean {
  return !!editorId && OFFICE_EDITOR_IDS.has(editorId);
}

/**
 * Mobile UA for office editors — same shape as `office_user_agent` in
 * nextcloud/android: `Mozilla/5.0 (Android <ver>) Mobile Nextcloud-<app>/<ver>`.
 */
export function officeUserAgent(appVersion: string): string {
  return `Mozilla/5.0 (Android) Mobile Nextcloud-calendar/${appVersion}`;
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

/**
 * Creates a new file through a Direct Editing creator and returns the one-time
 * URL opening it in the editor. The file materialises at `path` (user-relative
 * Files path) — attach it like any other DAV file.
 */
export async function createDirectEditingUrl(
  account: FilesAccount,
  path: string,
  editorId: string,
  creatorId: string,
  templateId?: string,
): Promise<string> {
  const res = await trustedFetch(
    `${account.baseUrl.replace(/\/+$/, '')}/ocs/v2.php/apps/files/api/v1/directEditing/create`,
    {
      method: 'POST',
      headers: {
        ...ocsHeaders(account),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body:
        `path=${encodeURIComponent(path)}` +
        `&editorId=${encodeURIComponent(editorId)}` +
        `&creatorId=${encodeURIComponent(creatorId)}` +
        (templateId ? `&templateId=${encodeURIComponent(templateId)}` : ''),
      timeoutMs: 30000,
      maxRetries: 1,
    },
  );
  if (!res.ok) throw httpErrorFrom(res, 'createDirectEditingUrl');
  const json: unknown = await res.json();
  const url = (json as { ocs?: { data?: { url?: unknown } } })?.ocs?.data?.url;
  if (typeof url !== 'string' || !url) {
    throw new Error('createDirectEditingUrl: malformed OCS response');
  }
  return url;
}
