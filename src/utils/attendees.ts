import type { Attendee } from '@/types';

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
