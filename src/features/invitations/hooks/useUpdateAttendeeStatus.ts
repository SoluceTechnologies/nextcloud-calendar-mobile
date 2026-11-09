import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import type { Account, CalendarEvent, InvitationResponse } from '@/types';
import { patchByUid, seriesBaseUid } from '@/database/eventWrites';
import { findAttendeeForAccount } from '@/utils/attendees';
import { describeMutationError } from '@/services/shared/errors';
import i18n from '@/utils/i18n';

export function useUpdateAttendeeStatus(account: Account | null) {
  const [isPending, setIsPending] = useState(false);

  const mutateAsync = useCallback(
    async (event: CalendarEvent, response: InvitationResponse): Promise<void> => {
      if (!account) throw new Error('No active account');
      setIsPending(true);
      try {
        const { updateAttendeeStatus } = await import('@/services/nextcloud/invitations');
        const nextAttendees = await updateAttendeeStatus(account, event, response);

        const mine = findAttendeeForAccount(event.attendees, account);
        const attendeesToWrite = nextAttendees ?? event.attendees.map((att) =>
          mine && att.email.toLowerCase() === mine.email.toLowerCase()
            ? { ...att, partstat: response }
            : att
        );
        await patchByUid(account.id, seriesBaseUid(event.uid), { attendees: attendeesToWrite });
      } catch (error) {
        Alert.alert(
          i18n.t('invitations.error'),
          describeMutationError(error),
        );
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [account],
  );

  const mutate = useCallback(
    (event: CalendarEvent, response: InvitationResponse) => {
      void mutateAsync(event, response);
    },
    [mutateAsync],
  );

  return { mutate, mutateAsync, isPending };
}
