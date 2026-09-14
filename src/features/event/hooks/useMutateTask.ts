import { useCallback } from 'react';
import { Alert } from 'react-native';

import { fetchEventIcs, updateEvent } from '@/services/nextcloud/caldav';
import { describeMutationError } from '@/services/shared/errors';
import { patchByUid } from '@/database/eventWrites';
import { setVtodoCompleted } from '@/utils/vtodo';
import i18n from '@/utils/i18n';
import type { Account, CalendarEvent } from '@/types';

import { useAction } from './useMutateEvent';

// Toggle a VTODO between COMPLETED and NEEDS-ACTION. The local row is patched
// optimistically; on failure the previous state is restored, mirroring
// useUpdateEvent's snapshot/rollback flow.
export function useToggleTask(account: Account) {
  return useAction<CalendarEvent>(
    useCallback(
      async (event) => {
        if (!event.isTask || event.readOnly) return;
        const next = !event.taskCompleted;

        const rollback = {
          taskStatus: event.taskStatus,
          taskCompletedAt: event.taskCompletedAt,
          taskPercent: event.taskPercent,
        };

        await patchByUid(account.id, event.uid, {
          taskStatus: next ? 'COMPLETED' : 'NEEDS-ACTION',
          taskCompletedAt: next ? new Date() : undefined,
          taskPercent: next ? 100 : 0,
        });

        try {
          const ics = await fetchEventIcs(account, event.href);
          await updateEvent(account, event.href, setVtodoCompleted(ics, next));
        } catch (error) {
          await patchByUid(account.id, event.uid, rollback);
          Alert.alert(i18n.t('event.errorUpdateFailed'), describeMutationError(error));
        }
      },
      [account],
    ),
  );
}
