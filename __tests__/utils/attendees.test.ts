import { dedupeAttendees, attendeeColor } from '@/utils/attendees';

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

describe('attendeeColor', () => {
  it('returns a hex color for an email', () => {
    expect(attendeeColor('a@example.org')).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('is deterministic for the same email', () => {
    expect(attendeeColor('a@example.org')).toBe(attendeeColor('a@example.org'));
  });

  it('is case-insensitive', () => {
    expect(attendeeColor('A@Example.org')).toBe(attendeeColor('a@example.org'));
  });

  it('produces different colors for different emails', () => {
    const colors = new Set([
      attendeeColor('a@example.org'),
      attendeeColor('b@example.org'),
      attendeeColor('c@example.org'),
      attendeeColor('d@example.org'),
    ]);
    expect(colors.size).toBeGreaterThanOrEqual(2);
  });
});
