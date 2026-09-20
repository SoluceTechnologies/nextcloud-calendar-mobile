import type { Account } from '@/types';
import { httpErrorFrom } from '../shared/errors';
import { trustedFetch } from '../shared/trustedFetch';
import { decodeXmlEntities } from './caldav';
import { fileDavUrl, type FilesAccount } from './files';

/**
 * The Nextcloud Calendar web app writes `ATTACH` URIs as `/f/<fileid>` links —
 * browser routes that 303 to the Files UI HTML, unusable for CalDAV clients
 * (server#59162). This module detects those links and resolves the file id to
 * the real WebDAV path so the file can be downloaded normally.
 */

export type ResolvedFile = {
  /** Absolute WebDAV URL — downloadable with the account credentials. */
  davUrl: string;
  /** DAV path relative to the user's files root — for deleteRemoteFile. */
  path: string;
  filename?: string;
  mime?: string;
  size?: number;
};

function basicAuth(account: Pick<Account, 'username' | 'appPassword'>): string {
  return 'Basic ' + btoa(`${account.username}:${account.appPassword}`);
}

/**
 * URI relative to the Nextcloud root (`f/123`, `index.php/s/token`), or null
 * when the URI is absolute and points outside this account's base URL.
 */
function pathBelowBase(account: FilesAccount, uri: string): string | null {
  const base = account.baseUrl.replace(/\/+$/, '');
  if (/^https?:/i.test(uri)) {
    if (!uri.startsWith(base + '/')) return null;
    return uri.slice(base.length + 1);
  }
  return uri.replace(/^\/+/, '');
}

/** File id from a `/f/<id>` (or `index.php/f/<id>`) link, null when not one. */
export function internalFileId(account: FilesAccount, uri: string): number | null {
  const path = pathBelowBase(account, uri);
  const m = path?.match(/^(?:index\.php\/)?f\/(\d+)\/?$/);
  return m ? Number(m[1]) : null;
}

/** Share token from a `/s/<token>` link (optional `/download[...]` suffix). */
export function publicShareToken(account: FilesAccount, uri: string): string | null {
  const path = pathBelowBase(account, uri);
  const m = path?.match(/^(?:index\.php\/)?s\/([A-Za-z0-9]+)(?:\/.*)?$/);
  return m ? m[1] : null;
}

/**
 * Loose pre-check used by `isOpenableAttachment` — true for the link shapes we
 * can resolve on this server, relative or absolute (any host; foreign hosts
 * simply fall back to the browser at open time).
 */
export function isFileLinkUri(uri?: string): boolean {
  if (!uri) return false;
  return /^(?:https?:\/\/[^/]+)?\/?(?:index\.php\/)?[fs]\/[^/?#]+\/?(?:download)?/i.test(
    uri,
  );
}

/** Direct download endpoint for a public share — no credentials needed. */
export function shareDownloadUrl(account: FilesAccount, token: string): string {
  return `${account.baseUrl.replace(/\/+$/, '')}/s/${encodeURIComponent(token)}/download`;
}

function davHrefToPath(account: FilesAccount, href: string): string | null {
  const root = `/remote.php/dav/files/${encodeURIComponent(account.davUserId)}`;
  if (!href.startsWith(root + '/')) return null;
  try {
    const path = decodeURIComponent(href.slice(root.length));
    if (path.split('/').some((s) => s === '..')) return null;
    return path;
  } catch {
    return null;
  }
}

function propOf(chunk: string, tag: string): string | undefined {
  const m = chunk.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? decodeXmlEntities(m[1]).trim() : undefined;
}

function parseMultistatus(xml: string): { href: string; chunk: string }[] {
  const out: { href: string; chunk: string }[] = [];
  const re = /<d:response[^>]*>([\s\S]*?)<\/d:response>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const href = propOf(m[1], 'd:href');
    if (href) out.push({ href, chunk: m[1] });
  }
  return out;
}

/** `SEARCH` basicsearch by file id — one request on Nextcloud ≥ ~20. */
async function searchByFileId(
  account: FilesAccount,
  fileId: number,
): Promise<ResolvedFile | null> {
  const body =
    '<?xml version="1.0"?>' +
    '<d:searchrequest xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">' +
    '<d:basicsearch><d:select><d:prop><d:displayname/><d:getcontenttype/>' +
    '<d:getcontentlength/></d:prop></d:select>' +
    '<d:from><d:scope><d:href>/files/' +
    encodeURIComponent(account.davUserId) +
    '</d:href><d:depth>infinity</d:depth></d:scope></d:from>' +
    '<d:where><d:eq><d:prop><oc:fileid/></d:prop><d:literal>' +
    fileId +
    '</d:literal></d:eq></d:where></d:basicsearch></d:searchrequest>';
  const res = await trustedFetch(`${account.baseUrl}/remote.php/dav`, {
    method: 'SEARCH',
    headers: {
      Authorization: basicAuth(account),
      'Content-Type': 'application/xml; charset=utf-8',
    },
    body,
    timeoutMs: 30000,
    maxRetries: 1,
  });
  if (!res.ok) return null;
  for (const { href, chunk } of parseMultistatus(await res.text())) {
    const path = davHrefToPath(account, href);
    if (!path) continue;
    const size = Number(propOf(chunk, 'd:getcontentlength'));
    return {
      davUrl: fileDavUrl(account, path),
      path,
      filename: propOf(chunk, 'd:displayname') || undefined,
      mime: propOf(chunk, 'd:getcontenttype') || undefined,
      size: Number.isFinite(size) && size > 0 ? size : undefined,
    };
  }
  return null;
}

/**
 * Fallback for servers without the DAV search backend: walk the whole files
 * tree asking only for `oc:fileid`. Heavy on large accounts — last resort.
 */
async function walkByFileId(
  account: FilesAccount,
  fileId: number,
): Promise<ResolvedFile | null> {
  const res = await trustedFetch(
    fileDavUrl(account, '') + '/', // trailing slash — collections 301 without it
    {
      method: 'PROPFIND',
      headers: {
        Authorization: basicAuth(account),
        Depth: 'infinity',
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body:
        '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">' +
        '<d:prop><oc:fileid/><d:displayname/><d:getcontenttype/><d:getcontentlength/></d:prop></d:propfind>',
      timeoutMs: 30000,
      maxRetries: 1,
    },
  );
  if (!res.ok) throw httpErrorFrom(res, 'walkByFileId');
  for (const { href, chunk } of parseMultistatus(await res.text())) {
    if (propOf(chunk, 'oc:fileid') !== String(fileId)) continue;
    const path = davHrefToPath(account, href);
    if (!path) return null;
    const size = Number(propOf(chunk, 'd:getcontentlength'));
    return {
      davUrl: fileDavUrl(account, path),
      path,
      filename: propOf(chunk, 'd:displayname') || undefined,
      mime: propOf(chunk, 'd:getcontenttype') || undefined,
      size: Number.isFinite(size) && size > 0 ? size : undefined,
    };
  }
  return null;
}

/**
 * Resolves a `/f/<id>` link to the file's WebDAV location and metadata.
 * Returns null when the file no longer exists (or is outside the user's
 * files space — e.g. deleted share target).
 */
export async function resolveInternalFile(
  account: FilesAccount,
  fileId: number,
): Promise<ResolvedFile | null> {
  const found = await searchByFileId(account, fileId);
  if (found) return found;
  return walkByFileId(account, fileId);
}

/**
 * True when the attachment points at a file in the account's own space —
 * a direct DAV URL or a `/f/<id>` link that resolves to one. Governs whether
 * "remove and delete the file" is offered.
 */
export function isOwnFileRef(account: FilesAccount, att: { uri?: string }): boolean {
  return !!att.uri && internalFileId(account, att.uri) !== null;
}
