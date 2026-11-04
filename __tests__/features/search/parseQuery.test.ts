import { isEmptyQuery, parseQuery } from '@/features/search/parseQuery';

const empty = { title: [], description: [], location: [], calendar: [], attendee: [], date: [], text: [] };

describe('parseQuery', () => {
  it('turns plain words into free-text terms', () => {
    expect(parseQuery('call the dentist')).toEqual({ ...empty, text: ['call', 'the', 'dentist'] });
  });

  it('reads a title operator', () => {
    expect(parseQuery('title:dentist')).toEqual({ ...empty, title: ['dentist'] });
  });

  it('keeps a double-quoted value as one term', () => {
    expect(parseQuery('title:"call the dentist"')).toEqual({ ...empty, title: ['call the dentist'] });
  });

  it('keeps a single-quoted value as one term', () => {
    expect(parseQuery("location:'Salle B'")).toEqual({ ...empty, location: ['Salle B'] });
  });

  it('keeps an apostrophe inside a word as an ordinary character', () => {
    expect(parseQuery("l'équipe calendar:Perso")).toEqual({ ...empty, text: ["l'équipe"], calendar: ['Perso'] });
    expect(parseQuery("d'abord attendee:bob")).toEqual({ ...empty, text: ["d'abord"], attendee: ['bob'] });
  });

  it('keeps an apostrophe inside a quoted value', () => {
    expect(parseQuery(`calendar:"l'équipe" location:'Salle B'`)).toEqual({
      ...empty, calendar: ["l'équipe"], location: ['Salle B'],
    });
  });

  it('keeps a quoted free-text phrase together', () => {
    expect(parseQuery('"release notes"')).toEqual({ ...empty, text: ['release notes'] });
  });

  it('collects several operators in one query', () => {
    expect(parseQuery('calendar:Perso attendee:alice description:spec')).toEqual({
      ...empty, calendar: ['Perso'], attendee: ['alice'], description: ['spec'],
    });
  });

  it('matches the operator name case-insensitively', () => {
    expect(parseQuery('TITLE:x')).toEqual({ ...empty, title: ['x'] });
  });

  it('reads a date comparator', () => {
    expect(parseQuery('date:<2026-09-30 date:>=today')).toEqual({
      ...empty,
      date: [{ comparator: '<', value: '2026-09-30' }, { comparator: '>=', value: 'today' }],
    });
  });

  it('treats a date without a comparator as equality', () => {
    expect(parseQuery('date:tomorrow')).toEqual({ ...empty, date: [{ comparator: '=', value: 'tomorrow' }] });
  });

  it('keeps an unknown operator as free text', () => {
    expect(parseQuery('board:soon')).toEqual({ ...empty, text: ['board:soon'] });
  });

  it('keeps an empty operator value as an empty term', () => {
    expect(parseQuery('title:""')).toEqual({ ...empty, title: [''] });
    expect(parseQuery('title:')).toEqual({ ...empty, title: [''] });
  });

  it('is lenient about an unterminated quote', () => {
    expect(parseQuery('title:"abc')).toEqual({ ...empty, title: ['abc'] });
  });

  it('ignores runs of whitespace and tabs', () => {
    expect(parseQuery('  a \t b  ')).toEqual({ ...empty, text: ['a', 'b'] });
  });

  it('mixes free text and operators in any order', () => {
    expect(parseQuery('dentist location:Paris urgent')).toEqual({
      ...empty, location: ['Paris'], text: ['dentist', 'urgent'],
    });
  });
});

describe('isEmptyQuery', () => {
  it('is true for blank input and false for any term', () => {
    expect(isEmptyQuery(parseQuery('   '))).toBe(true);
    expect(isEmptyQuery(parseQuery('x'))).toBe(false);
    expect(isEmptyQuery(parseQuery('title:'))).toBe(false);
    expect(isEmptyQuery(parseQuery('calendar:x'))).toBe(false);
    expect(isEmptyQuery(parseQuery('location:x'))).toBe(false);
  });
});
