import type { Account } from '@/types';

/** Every function here only needs these four fields. */
export type FilesAccount = Pick<Account, 'baseUrl' | 'davUserId' | 'username' | 'appPassword'>;
import { decodeXmlEntities } from './caldav';
import { httpErrorFrom } from '../shared/errors';
import { trustedFetch } from '../shared/trustedFetch';

/** Same default folder as the Nextcloud Calendar web app. */
export const ATTACHMENTS_DIR = 'Calendar';

function basicAuth(account: Pick<Account, 'username' | 'appPassword'>): string {
  return 'Basic ' + btoa(`${account.username}:${account.appPassword}`);
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function filesUrl(account: FilesAccount, path = ''): string {
  return `${account.baseUrl}/remote.php/dav/files/${encodeURIComponent(account.davUserId)}${encodePath(path)}`;
}

/** Absolute WebDAV URL for a file path — the URI form written into ATTACH. */
export function fileDavUrl(account: FilesAccount, path: string): string {
  return filesUrl(account, path);
}

async function davFetch(
  url: string,
  account: FilesAccount,
  options: { method?: string; headers?: Record<string, string>; body?: string; bodyBase64?: string } = {},
) {
  return trustedFetch(url, {
    method: options.method,
    headers: { Authorization: basicAuth(account), ...(options.headers ?? {}) },
    body: options.body,
    bodyBase64: options.bodyBase64,
    timeoutMs: 30000,
    maxRetries: 2,
  });
}

export async function ensureFolder(account: FilesAccount, path: string): Promise<void> {
  const res = await davFetch(filesUrl(account, path), account, { method: 'MKCOL' });
  // 201 created · 405 already exists · 301/302 would mean a misconfigured server
  if (res.status === 405) return;
  if (!res.ok) throw httpErrorFrom(res, 'ensureFolder');
}

async function remoteExists(account: FilesAccount, path: string): Promise<boolean> {
  const res = await davFetch(filesUrl(account, path), account, { method: 'HEAD' });
  return res.ok;
}

function splitName(filename: string): { stem: string; ext: string } {
  const i = filename.lastIndexOf('.');
  return i > 0 ? { stem: filename.slice(0, i), ext: filename.slice(i) } : { stem: filename, ext: '' };
}

async function resolveConflict(account: FilesAccount, dir: string, filename: string): Promise<string> {
  if (!(await remoteExists(account, `${dir}/${filename}`))) return filename;
  const { stem, ext } = splitName(filename);
  for (let n = 2; n < 100; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!(await remoteExists(account, `${dir}/${candidate}`))) return candidate;
  }
  throw new Error('upload-conflict');
}

export type UploadedFile = {
  /** Absolute DAV URL — safe to write into ATTACH. */
  davUrl: string;
  /** The filename actually stored (after conflict resolution). */
  filename: string;
  /** DAV path of the stored file — what deleteRemoteFile expects. */
  path: string;
};

/**
 * Returns the DAV path when `url` points inside the account's own Files space,
 * null otherwise (external link, public share, other host…).
 */
export function ownDavPath(account: FilesAccount, url: string): string | null {
  const root = filesUrl(account, '');
  if (!url.startsWith(root + '/')) return null;
  let path: string;
  try {
    path = decodeURIComponent(url.slice(root.length));
  } catch {
    return null;
  }
  // A decoded '..' segment would escape the Files root — never follow it.
  if (path.split('/').some((s) => s === '..')) return null;
  return path;
}

export function isOwnDavFile(account: FilesAccount, att: { uri?: string }): boolean {
  return !!att.uri && ownDavPath(account, att.uri) !== null;
}

export type DavEntry = {
  /** DAV path below the user's files root (`/dir/file.pdf`). */
  path: string;
  name: string;
  isDir: boolean;
  mime?: string;
  size?: number;
};

/**
 * One level of a folder in the user's files space — the building block of the
 * in-app Nextcloud file picker. Entries are sorted folders-first by name.
 */
export async function listDavFolder(account: FilesAccount, path: string): Promise<DavEntry[]> {
  const res = await davFetch(filesUrl(account, path) + '/', account, {
    method: 'PROPFIND',
    headers: {
      Depth: '1',
      'Content-Type': 'application/xml; charset=utf-8',
    },
    body:
      '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/>' +
      '<d:resourcetype/><d:getcontenttype/><d:getcontentlength/></d:prop></d:propfind>',
  });
  if (!res.ok) throw httpErrorFrom(res, 'listDavFolder');
  const xml = await res.text();
  const root = `/remote.php/dav/files/${encodeURIComponent(account.davUserId)}`;
  const wanted = path.replace(/\/+$/, '') || '';
  const out: DavEntry[] = [];
  const re = /<d:response[^>]*>([\s\S]*?)<\/d:response>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const chunk = m[1];
    const href = chunk.match(/<d:href>([^<]*)<\/d:href>/)?.[1];
    if (!href) continue;
    let decoded: string;
    try {
      decoded = decodeXmlEntities(decodeURIComponent(href));
    } catch {
      continue; // malformed percent-encoding — skip the entry
    }
    if (!decoded.startsWith(root + '/')) continue;
    const rel = decoded.slice(root.length).replace(/\/+$/, '');
    if (rel === wanted) continue; // the collection itself
    const name =
      chunk.match(/<d:displayname[^>]*>([^<]*)<\/d:displayname>/)?.[1] ??
      rel.split('/').pop() ??
      rel;
    const size = Number(
      chunk.match(/<d:getcontentlength[^>]*>([^<]*)<\/d:getcontentlength>/)?.[1],
    );
    out.push({
      path: rel,
      name: decodeXmlEntities(name),
      isDir: /<d:collection/.test(chunk),
      mime:
        chunk.match(/<d:getcontenttype[^>]*>([^<]*)<\/d:getcontenttype>/)?.[1] ||
        undefined,
      size: Number.isFinite(size) ? size : undefined,
    });
  }
  out.sort((a, b) =>
    a.isDir === b.isDir
      ? a.name.localeCompare(b.name)
      : a.isDir ? -1 : 1,
  );
  return out;
}

/** Deletes a file inside the account's Files space. A missing file is a no-op. */
export async function deleteRemoteFile(account: FilesAccount, path: string): Promise<void> {
  const res = await davFetch(filesUrl(account, path), account, { method: 'DELETE' });
  if (res.status === 404) return;
  if (!res.ok) throw httpErrorFrom(res, 'deleteRemoteFile');
}

/**
 * The picked name becomes a single DAV path segment — strip separators and
 * dot-segments that would escape the attachments folder.
 */
function safeFilename(name: string): string {
  const cleaned = name.replace(/[/\\]/g, '_').trim();
  return cleaned === '' || cleaned === '.' || cleaned === '..' ? 'attachment' : cleaned;
}

/**
 * Uploads a file into the attachments folder, creating it if needed and
 * resolving name conflicts by suffixing (`name (2).ext`).
 */
export async function uploadAttachmentFile(
  account: FilesAccount,
  filename: string,
  contentBase64: string,
  mimeType?: string,
): Promise<UploadedFile> {
  await ensureFolder(account, `/${ATTACHMENTS_DIR}`);
  const safe = safeFilename(filename);
  // The HEAD-then-PUT conflict check races with concurrent uploads —
  // If-None-Match turns an overwrite into a 412 so we can retry the next suffix.
  for (let attempt = 0; attempt < 3; attempt++) {
    const stored = await resolveConflict(account, `/${ATTACHMENTS_DIR}`, safe);
    const path = `/${ATTACHMENTS_DIR}/${stored}`;
    const res = await davFetch(filesUrl(account, path), account, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType || 'application/octet-stream',
        'If-None-Match': '*',
      },
      bodyBase64: contentBase64,
    });
    if (res.status === 412) continue;
    if (!res.ok) throw httpErrorFrom(res, 'uploadAttachmentFile');
    return { davUrl: fileDavUrl(account, path), filename: stored, path };
  }
  throw new Error('upload-conflict');
}
