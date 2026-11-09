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

/**
 * Normalises a cal-address for comparison: strips `mailto:`/scheme prefixes and
 * trailing slashes, lowercases. `readAttendees` keeps the raw URI in `email` when it
 * is not mailto: (principal paths, urn:uuid:) so both sides go through this.
 */
export function normalizeCalAddress(address: string | undefined): string {
  if (!address) return '';
  return address
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:/i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

/**
 * Every cal-address that can mean "this account": the configured email, the
 * `username@` heuristic (username itself contains no `@`), the `davUserId` principal
 * slug, and each `calendar-user-address-set` href (normalised — `mailto:` entries
 * become bare addresses, principal paths their last segment).
 */
export function accountCalAddresses(account: Account): Set<string> {
  const mine = new Set<string>();
  const email = normalizeCalAddress(account.email);
  if (email) mine.add(email);
  const username = account.username.toLowerCase();
  if (username) mine.add(username);
  const davUserId = account.davUserId?.toLowerCase();
  if (davUserId) mine.add(davUserId);
  for (const href of account.calendarUserAddresses ?? []) {
    const normalized = normalizeCalAddress(href);
    if (!normalized) continue;
    mine.add(normalized);
    const last = normalized.split('/').filter(Boolean).pop();
    if (last) mine.add(last);
  }
  return mine;
}

export function isAttendeeOfAccount(attendee: Attendee, account: Account): boolean {
  const address = normalizeCalAddress(attendee.email);
  if (!address) return false;
  const mine = accountCalAddresses(account);
  if (mine.has(address)) return true;
  // Principal-path attendee (`principals/users/<uid>`) matches the davUserId slug.
  const last = address.split('/').filter(Boolean).pop();
  if (last && mine.has(last)) return true;
  const accountEmail = account.email?.toLowerCase();
  if (accountEmail) return false;
  // Without a configured email, username@domain remains a plausible match.
  const accountUsername = account.username.toLowerCase();
  return address.startsWith(`${accountUsername}@`) || address === accountUsername;
}

export function findAttendeeForAccount(attendees: Attendee[], account: Account): Attendee | undefined {
  const accountEmail = account.email?.toLowerCase();
  const direct = accountEmail
    ? attendees.find((att) => att.email?.toLowerCase() === accountEmail)
    : undefined;
  if (direct) return direct;
  // Alias/principal-path candidates and the username@ heuristic must stay
  // unambiguous: bob@a.com and bob@b.com both match user 'bob' — picking one would
  // reply as the wrong person, so no candidate is better than a guessed one.
  const matches = attendees.filter((att) => isAttendeeOfAccount(att, account));
  return matches.length === 1 ? matches[0] : undefined;
}

export function isOrganizerOfAccount(event: CalendarEvent, account: Account | null): boolean {
  if (!account || !event.organizerEmail) return false;
  return isAttendeeOfAccount({ email: event.organizerEmail }, account);
}

export function getAttendeePartstat(event: CalendarEvent, account: Account): string | undefined {
  return findAttendeeForAccount(event.attendees, account)?.partstat?.toLowerCase();
}

export function isCurrentUserAttendee(event: CalendarEvent, account: Account | null): boolean {
  if (!account || !event.attendees?.length) return false;
  return !!findAttendeeForAccount(event.attendees, account);
}
