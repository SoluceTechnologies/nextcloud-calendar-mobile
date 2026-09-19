import type { Account } from '@/types';
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

function filesUrl(account: Account, path = ''): string {
  return `${account.baseUrl}/remote.php/dav/files/${encodeURIComponent(account.davUserId)}${encodePath(path)}`;
}

/** Absolute WebDAV URL for a file path — the URI form written into ATTACH. */
export function fileDavUrl(account: Account, path: string): string {
  return filesUrl(account, path);
}

async function davFetch(
  url: string,
  account: Account,
  options: { method?: string; headers?: Record<string, string>; bodyBase64?: string } = {},
) {
  return trustedFetch(url, {
    method: options.method,
    headers: { Authorization: basicAuth(account), ...(options.headers ?? {}) },
    bodyBase64: options.bodyBase64,
    timeoutMs: 30000,
    maxRetries: 2,
  });
}

export async function ensureFolder(account: Account, path: string): Promise<void> {
  const res = await davFetch(filesUrl(account, path), account, { method: 'MKCOL' });
  // 201 created · 405 already exists · 301/302 would mean a misconfigured server
  if (res.status === 405) return;
  if (!res.ok) throw httpErrorFrom(res, 'ensureFolder');
}

async function remoteExists(account: Account, path: string): Promise<boolean> {
  const res = await davFetch(filesUrl(account, path), account, { method: 'HEAD' });
  return res.ok;
}

function splitName(filename: string): { stem: string; ext: string } {
  const i = filename.lastIndexOf('.');
  return i > 0 ? { stem: filename.slice(0, i), ext: filename.slice(i) } : { stem: filename, ext: '' };
}

async function resolveConflict(account: Account, dir: string, filename: string): Promise<string> {
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
};

/**
 * Returns the DAV path when `url` points inside the account's own Files space,
 * null otherwise (external link, public share, other host…).
 */
export function ownDavPath(account: Account, url: string): string | null {
  const root = filesUrl(account, '');
  if (!url.startsWith(root + '/')) return null;
  return decodeURIComponent(url.slice(root.length));
}

export function isOwnDavFile(account: Account, att: { uri?: string }): boolean {
  return !!att.uri && ownDavPath(account, att.uri) !== null;
}

/** Deletes a file inside the account's Files space. A missing file is a no-op. */
export async function deleteRemoteFile(account: Account, path: string): Promise<void> {
  const res = await davFetch(filesUrl(account, path), account, { method: 'DELETE' });
  if (res.status === 404) return;
  if (!res.ok) throw httpErrorFrom(res, 'deleteRemoteFile');
}

/**
 * Uploads a file into the attachments folder, creating it if needed and
 * resolving name conflicts by suffixing (`name (2).ext`).
 */
export async function uploadAttachmentFile(
  account: Account,
  filename: string,
  contentBase64: string,
  mimeType?: string,
): Promise<UploadedFile> {
  await ensureFolder(account, `/${ATTACHMENTS_DIR}`);
  const stored = await resolveConflict(account, `/${ATTACHMENTS_DIR}`, filename);
  const path = `/${ATTACHMENTS_DIR}/${stored}`;
  const res = await davFetch(filesUrl(account, path), account, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType || 'application/octet-stream' },
    bodyBase64: contentBase64,
  });
  if (!res.ok) throw httpErrorFrom(res, 'uploadAttachmentFile');
  return { davUrl: fileDavUrl(account, path), filename: stored };
}
