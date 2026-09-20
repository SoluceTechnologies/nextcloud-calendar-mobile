import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { fetchEventIcsWithEtag, updateEvent } from '@/services/nextcloud/caldav';
import {
  deleteRemoteFile, ownDavPath, uploadAttachmentFile, type UploadedFile,
} from '@/services/nextcloud/files';
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
export function useEventAttachments(
  account: Account | null,
  event: CalendarEvent | null | undefined,
  calendar: CalendarMeta | undefined,
) {
  const [isPending, setIsPending] = useState(false);

  const ready =
    !!account && !!event?.href && !!calendar &&
    !event?.isTask && !calendar.isReadOnly && !calendar.isSubscribed;

  const add = useCallback(
    async (file: PendingAttachment) => {
      if (!account || !event?.href || !calendar) return;
      setIsPending(true);
      let uploaded: UploadedFile | undefined;
      try {
        uploaded = await uploadAttachmentFile(
          account, file.name, file.contentBase64, file.mimeType,
        );
        const { ics, etag } = await fetchEventIcsWithEtag(account, event.href);
        const next = injectAttachLine(
          ics,
          buildAttachLine({
            uri: uploaded.davUrl,
            filename: uploaded.filename,
            fmttype: file.mimeType,
            size: file.size,
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
        setIsPending(false);
      }
    },
    [account, event?.href, calendar],
  );

  const remove = useCallback(
    async (att: EventAttachment, opts?: { deleteFile?: boolean }) => {
      if (!account || !event?.href || !calendar) return;
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
        setIsPending(false);
      }
      if (unlinked && opts?.deleteFile && att.uri) {
        const path = ownDavPath(account, att.uri);
        if (path) {
          try {
            await deleteRemoteFile(account, path);
          } catch (error) {
            console.warn('[attachments] remote file delete failed', error);
            Alert.alert(i18n.t('event.attachmentFileDeleteError'));
          }
        }
      }
    },
    [account, event?.href, calendar],
  );

  return { add, remove, isPending, ready };
}
