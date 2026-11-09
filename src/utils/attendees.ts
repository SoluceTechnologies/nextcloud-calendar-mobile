import type { Account, Attendee, CalendarEvent } from '@/types';

const ATTENDEE_PARAM_KEYS = [
  'partstat', 'role', 'rsvp', 'cutype', 'member', 'delegatedTo', 'delegatedFrom',
  'sentBy', 'scheduleAgent', 'scheduleStatus', 'scheduleForceSend',
] as const;

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
    // First occurrence wins per parameter; later duplicates only fill gaps.
    for (const key of ATTENDEE_PARAM_KEYS) {
      if (seen[key] === undefined && attendee[key] !== undefined) {
        (seen as Record<string, unknown>)[key] = attendee[key];
      }
    }
    if (attendee.extraParams) {
      seen.extraParams = { ...attendee.extraParams, ...seen.extraParams };
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
  const accountEmail = account.email?.toLowerCase();
  if (accountEmail) {
    return attendees.find((att) => att.email?.toLowerCase() === accountEmail);
  }
  // Without a configured account email, the username@ heuristic must be unambiguous:
  // bob@a.com and bob@b.com both match user 'bob' — picking one would reply as the
  // wrong person, so no candidate is better than a guessed one.
  const matches = attendees.filter((att) => isAttendeeOfAccount(att, account));
  return matches.length === 1 ? matches[0] : undefined;
}

export function isOrganizerOfAccount(event: CalendarEvent, account: Account | null): boolean {
  if (!account || !event.organizerEmail) return false;
  const organizer = event.organizerEmail.toLowerCase();
  const accountEmail = account.email?.toLowerCase();
  if (accountEmail) return organizer === accountEmail;
  return organizer.startsWith(`${account.username.toLowerCase()}@`) || organizer === account.username.toLowerCase();
}

export function getAttendeePartstat(event: CalendarEvent, account: Account): string | undefined {
  return findAttendeeForAccount(event.attendees, account)?.partstat?.toLowerCase();
}

export function isCurrentUserAttendee(event: CalendarEvent, account: Account | null): boolean {
  if (!account || !event.attendees?.length) return false;
  return !!findAttendeeForAccount(event.attendees, account);
}
