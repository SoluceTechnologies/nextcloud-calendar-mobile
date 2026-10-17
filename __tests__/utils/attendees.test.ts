import { dedupeAttendees, isAttendeeOfAccount, findAttendeeForAccount, getAttendeePartstat, isCurrentUserAttendee } from '@/utils/attendees';
import type { Account, CalendarEvent } from '@/types';

describe('dedupeAttendees', () => {
  it('leaves a list without duplicates alone', () => {
    const list = [
      { email: 'a@example.org', displayName: 'A' },
      { email: 'b@example.org', displayName: 'B' },
    ];
    expect(dedupeAttendees(list)).toEqual(list);
  });

  it('collapses a repeated address, keeping the first position', () => {
    const result = dedupeAttendees([
      { email: 'camille.roy@example.org', displayName: 'Camille' },
      { email: 'other@example.org', displayName: 'Other' },
      { email: 'camille.roy@example.org', displayName: 'Camille' },
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.email)).toEqual(['camille.roy@example.org', 'other@example.org']);
  });

  it('treats addresses as case-insensitive', () => {
    const result = dedupeAttendees([
      { email: 'Camille.Roy@Example.org' },
      { email: 'camille.roy@example.org' },
    ]);
    expect(result).toHaveLength(1);
  });

  it('ignores surrounding whitespace', () => {
    const result = dedupeAttendees([
      { email: ' a@example.org ' },
      { email: 'a@example.org' },
    ]);
    expect(result).toHaveLength(1);
  });

  it('adopts a display name from a later duplicate when the first had none', () => {
    const result = dedupeAttendees([
      { email: 'a@example.org' },
      { email: 'a@example.org', displayName: 'Alice' },
    ]);
    expect(result).toEqual([{ email: 'a@example.org', displayName: 'Alice' }]);
  });

  it('keeps the first display name when both carry one', () => {
    const result = dedupeAttendees([
      { email: 'a@example.org', displayName: 'Alice' },
      { email: 'a@example.org', displayName: 'A. Smith' },
    ]);
    expect(result).toEqual([{ email: 'a@example.org', displayName: 'Alice' }]);
  });

  it('does not mutate the input', () => {
    const input = [
      { email: 'a@example.org' },
      { email: 'a@example.org', displayName: 'Alice' },
    ];
    dedupeAttendees(input);
    expect(input[0].displayName).toBeUndefined();
  });

  it('keeps every entry that has no address, since they cannot be compared', () => {
    const result = dedupeAttendees([
      { email: '', displayName: 'Anonymous' },
      { email: '', displayName: 'Someone else' },
    ]);
    expect(result).toHaveLength(2);
  });

  it('produces a list whose emails are unique, which is what list keys rely on', () => {
    const result = dedupeAttendees([
      { email: 'a@example.org' },
      { email: 'A@example.org' },
      { email: 'b@example.org' },
      { email: 'a@example.org' },
    ]);
    const keys = result.map((a) => a.email);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('returns an empty list unchanged', () => {
    expect(dedupeAttendees([])).toEqual([]);
  });
});

const account: Account = {
  id: 'acc-1',
  displayName: 'Bob',
  baseUrl: 'https://cloud.example.com',
  username: 'bob',
  appPassword: 'xxxx',
  davUserId: 'bob',
  email: 'bob@example.com',
};

describe('isAttendeeOfAccount', () => {
  it('matches by email', () => {
    expect(isAttendeeOfAccount({ email: 'bob@example.com' }, account)).toBe(true);
  });

  it('matches by username fallback', () => {
    const usernameOnly = { ...account, email: undefined };
    expect(isAttendeeOfAccount({ email: 'bob@example.com' }, usernameOnly)).toBe(true);
    expect(isAttendeeOfAccount({ email: 'bob' }, usernameOnly)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isAttendeeOfAccount({ email: 'BOB@EXAMPLE.COM' }, account)).toBe(true);
  });

  it('returns false for a different attendee', () => {
    expect(isAttendeeOfAccount({ email: 'alice@example.com' }, account)).toBe(false);
  });
});

describe('findAttendeeForAccount', () => {
  it('finds the matching attendee', () => {
    const attendees = [
      { email: 'alice@example.com', partstat: 'accepted' },
      { email: 'bob@example.com', partstat: 'tentative' },
    ];
    expect(findAttendeeForAccount(attendees, account)).toEqual({
      email: 'bob@example.com',
      partstat: 'tentative',
    });
  });
});

describe('getAttendeePartstat', () => {
  it('returns the partstat of the current user', () => {
    const event: CalendarEvent = {
      uid: 'evt-1',
      href: 'https://cloud.example.com/cal/personal/evt-1.ics',
      calendarId: 'cal-1',
      accountId: 'acc-1',
      summary: 'Meeting',
      dtstart: new Date(),
      dtend: new Date(),
      allDay: false,
      color: '#000',
      attendees: [{ email: 'bob@example.com', partstat: 'accepted' }],
      isRecurring: false,
    };
    expect(getAttendeePartstat(event, account)).toBe('accepted');
  });
});

describe('isCurrentUserAttendee', () => {
  it('returns true when the user is in the attendee list', () => {
    const event: CalendarEvent = {
      uid: 'evt-1',
      href: 'https://cloud.example.com/cal/personal/evt-1.ics',
      calendarId: 'cal-1',
      accountId: 'acc-1',
      summary: 'Meeting',
      dtstart: new Date(),
      dtend: new Date(),
      allDay: false,
      color: '#000',
      attendees: [{ email: 'bob@example.com' }],
      isRecurring: false,
    };
    expect(isCurrentUserAttendee(event, account)).toBe(true);
    expect(isCurrentUserAttendee(event, null)).toBe(false);
  });
});
