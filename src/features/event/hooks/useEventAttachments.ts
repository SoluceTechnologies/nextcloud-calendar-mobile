import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { fetchEventIcsWithEtag, updateEvent } from '@/services/nextcloud/caldav';
import {
  deleteRemoteFile, ownDavPath, uploadAttachmentFile, type UploadedFile,
} from '@/services/nextcloud/files';
import { internalFileId, publicShareToken, resolveInternalFile } from '@/services/nextcloud/fileLinks';
import { createPublicLinkShare, deleteShare, findShareByToken } from '@/services/nextcloud/shares';
import { askAttachmentShareMode } from '@/features/event/utils/attachments';
import { describeMutationError } from '@/services/shared/errors';
import { syncCalendarDelta } from '@/database/sync';
import { buildAttachLine, injectAttachLine, removeAttachLine } from '@/features/event/utils/attachmentWrite';
import i18n from '@/utils/i18n';
import type {
  Account, CalendarEvent, CalendarMeta, EventAttachment, PendingAttachment,
} from '@/types';

/**
 * Add/remove ATTACH properties on an existing event.
 *
 * Attachments belong to the VEVENT master, so adding one to a recurring event
 * applies to the whole series — same semantics as the Nextcloud Calendar web
 * app. Removing an attachment unlinks it from the event; deleting the remote
 * file is opt-in (`deleteFile`) and only possible for files inside the
 * account's own DAV space.
 */
/**
 * Turns a DAV path into the URI written into ATTACH: a `/s/<token>` public
 * link when the caller chose public sharing, the private DAV URL otherwise.
 * A failed share creation falls back to the private URL so the attachment
 * still exists (owner-only) rather than vanishing.
 */
async function publicUriOr(
  account: Account,
  path: string,
  fallbackUri: string,
  share: 'public' | 'private',
): Promise<string> {
  if (share !== 'public') return fallbackUri;
  try {
    return (await createPublicLinkShare(account, path)).url;
  } catch (error) {
    console.warn('[attachments] public share failed, keeping private link', error);
    return fallbackUri;
  }
}

export function useEventAttachments(
  account: Account | null,
  event: CalendarEvent | null | undefined,
  calendar: CalendarMeta | undefined,
) {
  const [isPending, setIsPending] = useState(false);
  // Guards against concurrent mutations — two remove() calls racing on the
  // same etag would make the loser's If-Match PUT fail with a spurious 412.
  const busy = useRef(false);

  const ready =
    !!account && !!event?.href && !!calendar &&
    !event?.isTask && !calendar.isReadOnly && !calendar.isSubscribed;

  const add = useCallback(
    async (file: PendingAttachment) => {
      if (!account || !event?.href || !calendar || busy.current) return;
      // Events with attendees: a private DAV URL is useless to them — offer
      // to expose the file through a public link, like the web app does.
      const share =
        (event.attendees?.length ?? 0) > 0 ? await askAttachmentShareMode() : 'private';
      if (share === null) return;
      busy.current = true;
      setIsPending(true);
      let uploaded: UploadedFile | undefined;
      try {
        uploaded = await uploadAttachmentFile(
          account, file.name, file.contentBase64, file.mimeType,
        );
        const uri = await publicUriOr(account, uploaded.path, uploaded.davUrl, share);
        const { ics, etag } = await fetchEventIcsWithEtag(account, event.href);
        const next = injectAttachLine(
          ics,
          buildAttachLine({
            uri,
            filename: uploaded.filename,
            fmttype: file.mimeType,
            size: file.size,
            fileId: uploaded.fileId,
          }),
        );
        await updateEvent(account, event.href, next, etag);
        await syncCalendarDelta(account, calendar);
      } catch (error) {
        // The event was never updated — the uploaded file would be orphaned.
        if (uploaded) await deleteRemoteFile(account, uploaded.path).catch(() => {});
        console.warn('[attachments] add failed', error);
        Alert.alert(i18n.t('event.attachmentAddError'), describeMutationError(error));
      } finally {
        busy.current = false;
        setIsPending(false);
      }
    },
    [account, event, calendar],
  );

  /**
   * Attaches a file already on Nextcloud — no upload, the DAV URL goes
   * straight into a new ATTACH line.
   */
  const addRemote = useCallback(
    async (att: EventAttachment) => {
      if (!account || !event?.href || !calendar || busy.current) return;
      const share =
        (event.attendees?.length ?? 0) > 0 ? await askAttachmentShareMode() : 'private';
      if (share === null) return;
      busy.current = true;
      setIsPending(true);
      try {
        // The picker only yields own-DAV files, so a public share is possible.
        const path = att.uri ? ownDavPath(account, att.uri) : null;
        const uri =
          share === 'public' && path && att.uri
            ? await publicUriOr(account, path, att.uri, share)
            : att.uri;
        const { ics, etag } = await fetchEventIcsWithEtag(account, event.href);
        const next = injectAttachLine(ics, buildAttachLine({ ...att, uri }));
        await updateEvent(account, event.href, next, etag);
        await syncCalendarDelta(account, calendar);
      } catch (error) {
        console.warn('[attachments] add remote failed', error);
        Alert.alert(i18n.t('event.attachmentAddError'), describeMutationError(error));
      } finally {
        busy.current = false;
        setIsPending(false);
      }
    },
    [account, event, calendar],
  );

  const remove = useCallback(
    async (
      att: EventAttachment,
      opts?: { deleteFile?: boolean; revokeShare?: boolean },
    ) => {
      if (!account || !event?.href || !calendar || busy.current) return;
      busy.current = true;
      setIsPending(true);
      let unlinked = false;
      try {
        const { ics, etag } = await fetchEventIcsWithEtag(account, event.href);
        const next = removeAttachLine(ics, att);
        if (next !== ics) {
          await updateEvent(account, event.href, next, etag);
          unlinked = true;
        } else {
          // No matching ATTACH line — the local row is stale. Resyncing
          // reconciles it; the remote file must NOT be deleted while the
          // link may still exist in the stored ICS.
          console.warn('[attachments] remove matched no ATTACH line; resyncing');
        }
        await syncCalendarDelta(account, calendar);
      } catch (error) {
        console.warn('[attachments] remove failed', error);
        Alert.alert(i18n.t('event.attachmentRemoveError'), describeMutationError(error));
      } finally {
        busy.current = false;
        setIsPending(false);
      }
      if (unlinked && opts?.deleteFile && att.uri) {
        try {
          let path = ownDavPath(account, att.uri);
          if (!path) {
            // `/f/<id>` link written by the web app — resolve to its DAV path.
            const fileId = internalFileId(account, att.uri);
            if (fileId != null) {
              path = (await resolveInternalFile(account, fileId))?.path ?? null;
            }
          }
          if (path) await deleteRemoteFile(account, path);
        } catch (error) {
          console.warn('[attachments] remote file delete failed', error);
          Alert.alert(i18n.t('event.attachmentFileDeleteError'));
        }
      }
      if (unlinked && opts?.revokeShare && att.uri) {
        try {
          // `/s/<token>` ATTACH — find our matching share and revoke it.
          const token = publicShareToken(account, att.uri);
          const share = token ? await findShareByToken(account, token) : null;
          if (share) await deleteShare(account, share.id);
        } catch (error) {
          console.warn('[attachments] share revoke failed', error);
          Alert.alert(i18n.t('event.attachmentShareRevokeError'));
        }
      }
    },
    [account, event?.href, calendar],
  );

  return { add, addRemote, remove, isPending, ready };
}
