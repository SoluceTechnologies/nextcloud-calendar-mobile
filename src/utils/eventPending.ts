import type { Account, CalendarEvent } from '@/types';
import { findAttendeeForAccount } from '@/utils/attendees';

export function isEventPending(event: CalendarEvent, account: Account | null): boolean {
  if (!account || !event.attendees?.length) return false;
  const mine = findAttendeeForAccount(event.attendees, account);
  const partstat = mine?.partstat?.toLowerCase();
  return !!mine && (!partstat || partstat === 'needs-action');
}
