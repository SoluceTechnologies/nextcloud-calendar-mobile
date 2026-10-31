import type { Account, CalendarEvent } from '@/types';

export function isEventPending(event: CalendarEvent, account: Account | null): boolean {
  if (!account || !event.attendees?.length) return false;

  const accountEmail = account.email?.toLowerCase();
  const accountUsername = account.username.toLowerCase();

  for (const attendee of event.attendees) {
    const email = attendee.email.toLowerCase();
    const isMatch = accountEmail
      ? email === accountEmail
      : email.startsWith(`${accountUsername}@`) || email === accountUsername;

    if (isMatch && (!attendee.partstat || attendee.partstat.toLowerCase() === 'needs-action')) {
      return true;
    }
  }

  return false;
}
