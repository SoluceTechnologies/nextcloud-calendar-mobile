import type { Account, CalendarEvent } from '@/types';
import { findAttendeeForAccount, isOrganizerOfAccount } from '@/utils/attendees';

export function isEventPending(event: CalendarEvent, account: Account | null): boolean {
  if (!account || !event.attendees?.length) return false;
  // Events I organised are never "invitations to me", even if I also appear as an
  // attendee (self-invite).
  if (isOrganizerOfAccount(event, account)) return false;
  const mine = findAttendeeForAccount(event.attendees, account);
  const partstat = mine?.partstat?.toLowerCase();
  // NEEDS-ACTION (or absent — RFC default) and TENTATIVE render as pending invites.
  return !!mine && (!partstat || partstat === 'needs-action' || partstat === 'tentative');
}
