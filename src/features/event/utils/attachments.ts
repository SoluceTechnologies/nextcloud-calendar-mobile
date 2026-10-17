import { Alert, Linking } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Paperclip,
  type LucideIcon,
} from 'lucide-react-native';

import {
  trustedFetch,
  ResponseTooLargeError,
  type TrustedResponse,
} from '@/services/shared/trustedFetch';
import { fetchEventIcs } from '@/services/nextcloud/caldav';
import {
  internalFileId,
  isFileLinkUri,
  publicShareToken,
  resolveInternalFile,
  shareDownloadUrl,
} from '@/services/nextcloud/fileLinks';
import { utf8ToBase64 } from '@/services/shared/base64';
import { base64Fingerprint, extractEventAttachments } from '@/utils/caldav-parse';
import i18n from '@/utils/i18n';
import type { Account, EventAttachment, PendingAttachment } from '@/types';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_CACHE_TTL_MS = 60 * 60 * 1000;

const EXT = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic', 'heif', 'bmp'],
  spreadsheet: ['csv', 'xls', 'xlsx', 'ods', 'tsv'],
  audio: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac', 'aac'],
  video: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'],
  archive: ['zip', 'tar', 'gz', 'tgz', 'bz2', '7z', 'rar'],
  text: ['txt', 'md', 'log'],
};

function extOf(filename?: string): string {
  const i = filename?.lastIndexOf('.') ?? -1;
  return i >= 0 ? filename!.slice(i + 1).toLowerCase() : '';
}

export function attachmentIcon(att: EventAttachment): LucideIcon {
  const mime = (att.fmttype ?? '').toLowerCase();
  const ext = extOf(att.filename);
  if (mime.startsWith('image/') || EXT.image.includes(ext)) return FileImage;
  if (
    mime.includes('spreadsheet') || mime.includes('excel') || mime === 'text/csv' ||
    EXT.spreadsheet.includes(ext)
  ) return FileSpreadsheet;
  if (mime.startsWith('audio/') || EXT.audio.includes(ext)) return FileAudio;
  if (mime.startsWith('video/') || EXT.video.includes(ext)) return FileVideo;
  if (
    mime.includes('zip') || mime.includes('compressed') || mime.includes('archive') ||
    EXT.archive.includes(ext)
  ) return FileArchive;
  if (mime === 'application/pdf' || ext === 'pdf') return FileText;
  if (mime.startsWith('text/') || EXT.text.includes(ext)) return FileText;
  if (mime) return FileIcon;
  return Paperclip;
}

export function formatBytes(n?: number): string | undefined {
  if (!n || !Number.isFinite(n) || n <= 0) return undefined;
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n;
  let i = -1;
  do {
    v /= 1024;
    i++;
  } while (v >= 1024 && i < units.length - 1);
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function attachmentDisplayName(att: EventAttachment): string {
  return att.filename?.trim() || i18n.t('event.attachmentUntitled');
}

export function isOpenableAttachment(att: EventAttachment): boolean {
  return (
    !!att.base64 ||
    !!att.inline ||
    /^https?:/i.test(att.uri ?? '') ||
    isFileLinkUri(att.uri) // relative /f/<id> or /s/<token> written by the web app
  );
}

function originOf(url: string): string {
  const m = url.match(/^(https?):\/\/(?:[^@/?#]*@)?([^/?#]+)/i);
  return m ? `${m[1].toLowerCase()}://${m[2].toLowerCase()}` : '';
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(-80) || 'attachment';
}

// Credentials are only attached on an exact origin match (scheme + host +
// port): an http:// URI must never receive the credentials of an https://
// account, even on the same host.
function isSameOrigin(att: EventAttachment, account: Account | null): boolean {
  const origin = originOf(att.uri ?? '');
  return !!origin && !!account && origin === originOf(account.baseUrl);
}

export function decodedBase64Bytes(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(b64.length * 3 / 4) - padding);
}

function base64Size(att: EventAttachment): number {
  // A declared SIZE parameter can lie — never trust it below the real payload size.
  return Math.max(att.size ?? 0, decodedBase64Bytes(att.base64 ?? ''));
}

async function pruneAttachmentCache(dir: string): Promise<void> {
  try {
    const cutoff = Date.now() - ATTACHMENT_CACHE_TTL_MS;
    for (const file of await FileSystem.readDirectoryAsync(dir)) {
      const ts = Number(file.slice(0, file.indexOf('-')));
      if (Number.isFinite(ts) && ts < cutoff) {
        await FileSystem.deleteAsync(dir + file, { idempotent: true }).catch(() => {});
      }
    }
  } catch {
    // Best effort — a failed cleanup must not block opening a file.
  }
}

async function cacheFileFor(att: EventAttachment): Promise<string> {
  const root = FileSystem.cacheDirectory;
  if (!root) throw new Error('no-cache-directory');
  const dir = `${root}attachments/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  void pruneAttachmentCache(dir);
  const ext = extOf(att.filename);
  const base = sanitizeFilename(att.filename ?? 'attachment');
  const name = ext ? base : `${base}${guessExt(att.fmttype)}`;
  return dir + `${Date.now()}-${name}`;
}

function guessExt(mime?: string): string {
  if (!mime) return '';
  const known: Record<string, string> = {
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'text/csv': '.csv',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/zip': '.zip',
  };
  return known[mime.toLowerCase()] ?? '';
}

async function shareFile(fileUri: string, att: EventAttachment): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('sharing-unavailable');
  }
  await Sharing.shareAsync(fileUri, {
    mimeType: att.fmttype || undefined,
    dialogTitle: attachmentDisplayName(att),
  });
}

async function openBase64Attachment(att: EventAttachment): Promise<void> {
  if (base64Size(att) > MAX_ATTACHMENT_BYTES) {
    Alert.alert(i18n.t('event.attachmentTooLarge'));
    return;
  }
  const fileUri = await cacheFileFor(att);
  await FileSystem.writeAsStringAsync(fileUri, att.base64!, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await shareFile(fileUri, att);
}

function authHeader(account: Account): string {
  return `Basic ${utf8ToBase64(`${account.username}:${account.appPassword}`)}`;
}

async function downloadAndShare(
  url: string,
  att: EventAttachment,
  auth?: string,
): Promise<void> {
  const headers: Record<string, string> = auth ? { Authorization: auth } : {};

  // A HEAD first avoids downloading a body we would reject anyway: the
  // declared SIZE parameter can lie.
  try {
    const head = await trustedFetch(url, {
      method: 'HEAD',
      headers,
      timeoutMs: 15000,
    });
    const len = Number(head.headers.get('content-length'));
    if (head.ok && Number.isFinite(len) && len > MAX_ATTACHMENT_BYTES) {
      Alert.alert(i18n.t('event.attachmentTooLarge'));
      return;
    }
  } catch {
    // HEAD unsupported or transient failure — fall through to the guarded GET.
  }

  // maxBodyBytes makes the native layer abort the response instead of
  // buffering an oversized body (e.g. a chunked reply with no Content-Length).
  let res: TrustedResponse;
  try {
    res = await trustedFetch(url, {
      headers,
      timeoutMs: 30000,
      maxBodyBytes: MAX_ATTACHMENT_BYTES,
    });
  } catch (e) {
    if (e instanceof ResponseTooLargeError) {
      Alert.alert(i18n.t('event.attachmentTooLarge'));
      return;
    }
    throw e;
  }
  if (!res.ok) {
    throw new Error(`attachment-download-${res.status}`);
  }
  // An HTML body means a login/redirect page (expired session, password-gated
  // share, unresolved /f/ link) — never the file itself.
  const contentType = res.headers.get('content-type') ?? '';
  if (/text\/html/i.test(contentType)) {
    throw new Error('attachment-download-html');
  }
  const contentLength = Number(res.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_ATTACHMENT_BYTES) {
    Alert.alert(i18n.t('event.attachmentTooLarge'));
    return;
  }
  const body = await res.base64();
  if (decodedBase64Bytes(body) > MAX_ATTACHMENT_BYTES) {
    Alert.alert(i18n.t('event.attachmentTooLarge'));
    return;
  }
  const fileUri = await cacheFileFor(att);
  await FileSystem.writeAsStringAsync(fileUri, body, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await shareFile(fileUri, att);
}

async function openUriAttachment(
  att: EventAttachment,
  account: Account | null,
): Promise<void> {
  const uri = att.uri!;

  if (att.size && att.size > MAX_ATTACHMENT_BYTES) {
    Alert.alert(i18n.t('event.attachmentTooLarge'));
    return;
  }

  // `/f/<id>` links (what the web app writes) resolve to the real DAV path
  // before downloading — a plain GET would return the Files UI HTML page.
  const fileId = account ? internalFileId(account, uri) : null;
  if (fileId != null && account) {
    const resolved = await resolveInternalFile(account, fileId);
    if (!resolved) throw new Error('attachment-file-not-found');
    const enriched: EventAttachment = {
      ...att,
      filename: att.filename ?? resolved.filename,
      fmttype: att.fmttype ?? resolved.mime,
      size: att.size ?? resolved.size,
    };
    if (enriched.size && enriched.size > MAX_ATTACHMENT_BYTES) {
      Alert.alert(i18n.t('event.attachmentTooLarge'));
      return;
    }
    await downloadAndShare(resolved.davUrl, enriched, authHeader(account));
    return;
  }

  // Public share links serve the file anonymously via /s/<token>/download.
  const shareToken = account ? publicShareToken(account, uri) : null;
  if (shareToken && account) {
    await downloadAndShare(shareDownloadUrl(account, shareToken), att);
    return;
  }

  // Public/external links: hand off to the system browser.
  if (!isSameOrigin(att, account)) {
    if (!/^https?:/i.test(uri)) throw new Error('attachment-unresolvable-uri');
    await Linking.openURL(uri);
    return;
  }

  // Same-host (private Nextcloud) files need the app credentials — plain
  // browser links would get a 401 without a web session.
  await downloadAndShare(uri, att, authHeader(account!));
}

/**
 * Recurrence occurrences store only attachment metadata (see caldav-parse):
 * re-fetch the event ICS to recover the embedded payload, then open it.
 */
async function openInlineAttachment(
  att: EventAttachment,
  account: Account | null,
  href?: string,
): Promise<void> {
  if (att.size && att.size > MAX_ATTACHMENT_BYTES) {
    Alert.alert(i18n.t('event.attachmentTooLarge'));
    return;
  }
  if (!account || !href) throw new Error('inline-attachment-no-source');
  const ics = await fetchEventIcs(account, href);
  const match = extractEventAttachments(ics).find(
    (candidate) =>
      !!candidate.base64 &&
      (candidate.filename ?? '') === (att.filename ?? '') &&
      (candidate.fmttype ?? '') === (att.fmttype ?? '') &&
      (candidate.size ?? 0) === (att.size ?? 0) &&
      (!att.digest || base64Fingerprint(candidate.base64) === att.digest),
  );
  if (!match?.base64) throw new Error('inline-attachment-not-found');
  await openBase64Attachment({ ...att, base64: match.base64 });
}

export async function openAttachment(
  att: EventAttachment,
  account: Account | null,
  href?: string,
): Promise<void> {
  try {
    if (att.base64) {
      await openBase64Attachment(att);
    } else if (att.inline) {
      await openInlineAttachment(att, account, href);
    } else if (att.uri && (/^https?:/i.test(att.uri) || isFileLinkUri(att.uri))) {
      await openUriAttachment(att, account);
    }
  } catch (error) {
    console.warn('[attachments] open failed', error);
    Alert.alert(i18n.t('event.attachmentOpenError'));
  }
}

/**
 * How an attachment written on an event with attendees should be shared.
 * `'public'` → create an OCS public link and write its `/s/<token>` URL so
 * attendees (including external emails) can open the file. `'private'` →
 * keep the authenticated DAV URL, only readable by the owner.
 */
export type AttachmentShareMode = 'public' | 'private';

/**
 * Asks how attachments added to an event *with attendees* should be shared —
 * mirroring the Nextcloud web app, which warns before exposing the file.
 * Resolves null when the user cancels (the caller should abort).
 */
/**
 * Opens the device document picker and reads the chosen file as base64.
 * Returns null when the user cancels, the file exceeds the size limit, or
 * reading fails (the user-facing alert is already shown in those cases).
 */
export async function pickDeviceAttachment(): Promise<PendingAttachment | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    const asset = result.assets[0];
    // `asset.size` may be missing — stat the cached copy rather than buffering
    // an oversized payload just to measure it.
    const size =
      asset.size ??
      (await FileSystem.getInfoAsync(asset.uri).then((i) => (i.exists ? i.size : undefined)));
    if (size !== undefined && size > MAX_ATTACHMENT_BYTES) {
      Alert.alert(i18n.t('event.attachmentTooLarge'));
      return null;
    }
    const contentBase64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    // A stale or picker-misreported size still gets caught on the payload.
    if (decodedBase64Bytes(contentBase64) > MAX_ATTACHMENT_BYTES) {
      Alert.alert(i18n.t('event.attachmentTooLarge'));
      return null;
    }
    return {
      name: asset.name,
      contentBase64,
      mimeType: asset.mimeType,
      size,
    };
  } catch (error) {
    console.warn('[attachments] pick/read failed', error);
    Alert.alert(i18n.t('event.attachmentAddError'));
    return null;
  }
}

export function askAttachmentShareMode(): Promise<AttachmentShareMode | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: AttachmentShareMode | null) => {
      if (!settled) { settled = true; resolve(v); }
    };
    Alert.alert(
      i18n.t('event.attachmentShareTitle'),
      i18n.t('event.attachmentSharePrompt'),
      [
        { text: i18n.t('common.cancel'), style: 'cancel', onPress: () => done(null) },
        { text: i18n.t('event.attachmentSharePrivate'), onPress: () => done('private') },
        { text: i18n.t('event.attachmentSharePublic'), onPress: () => done('public') },
      ],
      { cancelable: true, onDismiss: () => done(null) },
    );
  });
}
