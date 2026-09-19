import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { fetchEventIcs, updateEvent } from '@/services/nextcloud/caldav';
import { uploadAttachmentFile } from '@/services/nextcloud/files';
import { describeMutationError } from '@/services/shared/errors';
import { syncCalendarDelta } from '@/database/sync';
import { buildAttachLine, injectAttachLine, removeAttachLine } from '@/features/event/utils/attachmentWrite';
import i18n from '@/utils/i18n';
import type { Account, CalendarEvent, CalendarMeta, EventAttachment } from '@/types';

export type PickedAttachment = {
  name: string;
  contentBase64: string;
  mimeType?: string;
  size?: number;
};

/**
 * Add/remove ATTACH properties on an existing event.
 *
 * Attachments belong to the VEVENT master, so adding one to a recurring event
 * applies to the whole series — same semantics as the Nextcloud Calendar web
 * app. Removing an attachment only unlinks it from the event: the file itself
 * stays in the user's Nextcloud files.
 */
export function useEventAttachments(
  account: Account | null,
  event: CalendarEvent | null | undefined,
  calendar: CalendarMeta | undefined,
) {
  const [isPending, setIsPending] = useState(false);

  const ready = !!account && !!event?.href && !!calendar && !event?.isTask;

  const add = useCallback(
    async (file: PickedAttachment) => {
      if (!account || !event?.href || !calendar) return;
      setIsPending(true);
      try {
        const uploaded = await uploadAttachmentFile(
          account, file.name, file.contentBase64, file.mimeType,
        );
        const ics = await fetchEventIcs(account, event.href);
        const next = injectAttachLine(
          ics,
          buildAttachLine({
            uri: uploaded.davUrl,
            filename: uploaded.filename,
            fmttype: file.mimeType,
            size: file.size,
          }),
        );
        await updateEvent(account, event.href, next);
        await syncCalendarDelta(account, calendar);
      } catch (error) {
        console.warn('[attachments] add failed', error);
        Alert.alert(i18n.t('event.attachmentAddError'), describeMutationError(error));
      } finally {
        setIsPending(false);
      }
    },
    [account, event?.href, calendar],
  );

  const remove = useCallback(
    async (att: EventAttachment) => {
      if (!account || !event?.href || !calendar) return;
      setIsPending(true);
      try {
        const ics = await fetchEventIcs(account, event.href);
        const next = removeAttachLine(ics, att);
        await updateEvent(account, event.href, next);
        await syncCalendarDelta(account, calendar);
      } catch (error) {
        console.warn('[attachments] remove failed', error);
        Alert.alert(i18n.t('event.attachmentRemoveError'), describeMutationError(error));
      } finally {
        setIsPending(false);
      }
    },
    [account, event?.href, calendar],
  );

  return { add, remove, isPending, ready };
}
