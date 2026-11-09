import { dedupeAttendees, isAttendeeOfAccount, findAttendeeForAccount, getAttendeePartstat, isCurrentUserAttendee } from '@/utils/attendees';
import { isEventPending } from '@/utils/eventPending';
import type { Account, Attendee, CalendarEvent } from '@/types';

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

  it('keeps the parameters of the first occurrence, filling gaps from later duplicates', () => {
    const result = dedupeAttendees([
      { email: 'a@example.org', partstat: 'accepted' },
      { email: 'a@example.org', partstat: 'declined', role: 'OPT-PARTICIPANT', rsvp: false },
    ]);
    expect(result).toEqual([
      { email: 'a@example.org', partstat: 'accepted', role: 'OPT-PARTICIPANT', rsvp: false },
    ]);
  });

  it('merges extraParams keys per-parameter, first occurrence wins', () => {
    const result = dedupeAttendees([
      { email: 'a@example.org', extraParams: { 'x-one': 'first' } },
      { email: 'a@example.org', extraParams: { 'x-one': 'second', 'x-two': 'new' } },
    ]);
    expect(result).toEqual([
      { email: 'a@example.org', extraParams: { 'x-one': 'first', 'x-two': 'new' } },
    ]);
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

describe('address aliasing (B5)', () => {
  const aliased: Account = {
    ...account,
    email: undefined,
    calendarUserAddresses: [
      'mailto:test@example.com',
      '/remote.php/dav/principals/users/test/',
      'urn:uuid:11111111-2222-3333-4444-555555555555',
    ],
  };

  it('matches an attendee via a mailto: address-set alias', () => {
    expect(isAttendeeOfAccount({ email: 'test@example.com' }, aliased)).toBe(true);
  });

  it('matches an attendee given as a principal path via the davUserId slug', () => {
    expect(isAttendeeOfAccount({ email: '/remote.php/dav/principals/users/test/' }, aliased)).toBe(true);
    expect(isAttendeeOfAccount({ email: 'principals/users/bob' }, account)).toBe(true);
  });

  it('matches a bare uuid attendee via a urn:uuid: alias', () => {
    expect(isAttendeeOfAccount(
      { email: 'urn:uuid:11111111-2222-3333-4444-555555555555' }, aliased,
    )).toBe(true);
  });

  it('still rejects strangers', () => {
    expect(isAttendeeOfAccount({ email: 'someone-else@example.com' }, aliased)).toBe(false);
  });

  it('findAttendeeForAccount resolves through aliases for replies', () => {
    const att = findAttendeeForAccount(
      [{ email: 'principals/users/bob' }, { email: 'other@example.com' }],
      account,
    );
    expect(att?.email).toBe('principals/users/bob');
  });
});

describe('isEventPending (B5 rendering gate)', () => {
  const ev = (attendees: Attendee[], organizerEmail?: string): CalendarEvent => ({
    uid: 'evt-1',
    href: 'https://cloud.example.com/cal/personal/evt-1.ics',
    calendarId: 'cal-1',
    accountId: 'acc-1',
    summary: 'Meeting',
    dtstart: new Date(),
    dtend: new Date(),
    allDay: false,
    color: '#000',
    attendees,
    organizerEmail,
    isRecurring: false,
  });

  it('is pending when my attendee is NEEDS-ACTION or has no partstat', () => {
    expect(isEventPending(ev([{ email: 'bob@example.com', partstat: 'needs-action' }]), account)).toBe(true);
    expect(isEventPending(ev([{ email: 'bob@example.com' }]), account)).toBe(true);
  });

  it('is pending when my attendee is TENTATIVE', () => {
    expect(isEventPending(ev([{ email: 'bob@example.com', partstat: 'tentative' }]), account)).toBe(true);
  });

  it('is not pending once I accepted or declined', () => {
    expect(isEventPending(ev([{ email: 'bob@example.com', partstat: 'accepted' }]), account)).toBe(false);
    expect(isEventPending(ev([{ email: 'bob@example.com', partstat: 'declined' }]), account)).toBe(false);
  });

  it('is never pending when I am the organizer, even as attendee', () => {
    const event = ev(
      [{ email: 'bob@example.com', partstat: 'needs-action' }],
      'bob@example.com',
    );
    expect(isEventPending(event, account)).toBe(false);
  });

  it('does not flag strangers-only or empty attendee lists', () => {
    expect(isEventPending(ev([{ email: 'alice@example.com' }]), account)).toBe(false);
    expect(isEventPending(ev([]), account)).toBe(false);
    expect(isEventPending(ev([{ email: 'bob@example.com' }]), null)).toBe(false);
  });
});
