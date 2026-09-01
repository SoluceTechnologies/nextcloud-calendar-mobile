import type { Account, Attendee, CalendarEvent } from '@/types';

export function dedupeAttendees(attendees: Attendee[]): Attendee[] {
  const byEmail = new Map<string, Attendee>();
  const result: Attendee[] = [];

  for (const attendee of attendees) {
    const key = attendee.email?.trim().toLowerCase();
    if (!key) {
      result.push(attendee);
      continue;
    }

    const seen = byEmail.get(key);
    if (!seen) {
      const copy = { ...attendee };
      byEmail.set(key, copy);
      result.push(copy);
      continue;
    }

    if (!seen.displayName && attendee.displayName) {
      seen.displayName = attendee.displayName;
    }
  }

  return result;
}

export function isAttendeeOfAccount(attendee: Attendee, account: Account): boolean {
  const accountEmail = account.email?.toLowerCase();
  const accountUsername = account.username.toLowerCase();
  const email = attendee.email?.toLowerCase();
  if (!email) return false;
  if (accountEmail) return email === accountEmail;
  return email.startsWith(`${accountUsername}@`) || email === accountUsername;
}

export function findAttendeeForAccount(attendees: Attendee[], account: Account): Attendee | undefined {
  return attendees.find((att) => isAttendeeOfAccount(att, account));
}

export function getAttendeePartstat(event: CalendarEvent, account: Account): string | undefined {
  return findAttendeeForAccount(event.attendees, account)?.partstat?.toLowerCase();
}

export function isCurrentUserAttendee(event: CalendarEvent, account: Account | null): boolean {
  if (!account || !event.attendees?.length) return false;
  return !!findAttendeeForAccount(event.attendees, account);
}
