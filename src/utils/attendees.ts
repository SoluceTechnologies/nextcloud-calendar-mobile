import type { Attendee } from '@/types';

const ATTENDEE_COLORS = [
  '#E53935',
  '#1E88E5',
  '#43A047',
  '#FDD835',
  '#8E24AA',
  '#FB8C00',
  '#00ACC1',
  '#7CB342',
  '#5E35B1',
  '#F4511E',
  '#00897B',
  '#C0CA33',
  '#D81B60',
  '#3949AB',
] as const;

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function attendeeColor(email: string): string {
  const key = email.trim().toLowerCase();
  return ATTENDEE_COLORS[djb2(key) % ATTENDEE_COLORS.length];
}

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
