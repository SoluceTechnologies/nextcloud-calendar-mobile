import { EMPTY_MODEL } from '@/features/search/searchModel';
import type { Resolve, SearchModel } from '@/features/search/searchModel';
import { lastOpenWord, matchKey, parseInput, splitWords, toTerm, tokenFrom } from '@/features/search/searchSyntax';
import { parseQuery } from '@/features/search/parseQuery';

const resolve: Resolve = (key, raw) =>
  key === 'calendar' && raw.toLowerCase() === 'perso' ? { value: 'Perso', label: 'Perso', color: '#D4537E' } : null;

const shape = (segments: SearchModel['segments']) =>
  segments.map((segment) =>
    segment.kind === 'text'
      ? { text: segment.text }
      : { key: segment.token.key, value: segment.token.value, label: segment.token.label, color: segment.token.color },
  );

const model = (text: string): SearchModel => ({ ...EMPTY_MODEL, ...parseInput(text, resolve)! });

describe('splitWords', () => {
  it('splits on whitespace, keeps double-quoted spaces and marks the word being typed', () => {
    expect(splitWords('calendar:perso location:"Salle B" de')).toEqual([
      { text: 'calendar:perso', start: 0, closed: true },
      { text: 'location:Salle B', start: 15, closed: true },
      { text: 'de', start: 34, closed: false },
    ]);
  });

  it('keeps an apostrophe as an ordinary character', () => {
    expect(splitWords("d'équipe calendar:")).toEqual([
      { text: "d'équipe", start: 0, closed: true },
      { text: 'calendar:', start: 9, closed: false },
    ]);
  });
});

describe('matchKey', () => {
  it('recognises the filter keys case-insensitively and nothing else', () => {
    expect(matchKey('CALENDAR:perso')).toEqual({ key: 'calendar', value: 'perso' });
    expect(matchKey('attendee:')).toEqual({ key: 'attendee', value: '' });
    expect(matchKey('location:Paris')).toEqual({ key: 'location', value: 'Paris' });
    expect(matchKey('board:x')).toBeNull();
    expect(matchKey('http://x.io')).toBeNull();
    expect(matchKey(':perso')).toBeNull();
  });
});

describe('parseInput', () => {
  it('leaves plain words alone', () => {
    expect(parseInput('dentist urgent', resolve)).toBeNull();
  });

  it('turns a trailing key into a pending filter and freezes the text before it', () => {
    const parsed = parseInput('dentist calendar:', resolve)!;
    expect(shape(parsed.segments)).toEqual([{ text: 'dentist' }]);
    expect(parsed).toMatchObject({ input: '', pending: 'calendar' });
  });

  it('keeps a pasted open value as the pending value', () => {
    expect(parseInput('calendar:per', resolve)).toMatchObject({ segments: [], input: 'per', pending: 'calendar' });
  });

  it('turns complete key:value words into tokens, resolving labels', () => {
    const parsed = parseInput('calendar:PERSO location:"Salle B" dentist', resolve)!;
    expect(shape(parsed.segments)).toEqual([
      { key: 'calendar', value: 'Perso', label: 'Perso', color: '#D4537E' },
      { key: 'location', value: 'Salle B', label: 'Salle B', color: undefined },
    ]);
    expect(parsed).toMatchObject({ input: 'dentist', pending: null });
  });

  it('merges new text into the last text segment', () => {
    const base = parseInput('dentist calendar:', resolve)!.segments;
    const parsed = parseInput('urgent attendee:', resolve, base)!;
    expect(shape(parsed.segments)).toEqual([{ text: 'dentist urgent' }]);
    expect(parsed.pending).toBe('attendee');
  });

  it('never adds the same filter twice', () => {
    const base = parseInput('calendar:perso ', resolve)!.segments;
    expect(parseInput('calendar:Perso ', resolve, base)!.segments).toHaveLength(1);
  });

  it('treats a key followed by a space as plain text', () => {
    expect(parseInput('calendar: dentist', resolve)).toBeNull();
  });
});

describe('toTerm', () => {
  it('writes tokens as key:value, quoting spaces, then the free text', () => {
    expect(toTerm(model('dentist location:"Salle B" attendee:alice@example.org urgent'))).toBe(
      'dentist location:"Salle B" attendee:alice@example.org urgent',
    );
  });

  it('keeps calendar tokens', () => {
    expect(toTerm(model('calendar:perso dentist'))).toBe('calendar:Perso dentist');
  });

  it('never sends a pending filter or its value', () => {
    expect(toTerm(model('dentist calendar:per'))).toBe('dentist');
  });

  it('drops double quotes inside a quoted value', () => {
    const quoted: SearchModel = {
      ...EMPTY_MODEL,
      segments: [{ kind: 'token', token: { id: 'title', key: 'title', value: 'say "hi" now', label: 'say "hi" now' } }],
    };
    expect(toTerm(quoted)).toBe('title:"say hi now"');
  });

  it('round-trips through parseQuery', () => {
    const term = toTerm(model('dentist location:"Salle B" calendar:"Team & Co" date:upcoming urgent'));
    expect(parseQuery(term)).toMatchObject({
      location: ['Salle B'],
      calendar: ['Team & Co'],
      date: [{ comparator: '=', value: 'upcoming' }],
      text: ['dentist', 'urgent'],
    });
  });

  it('keeps every filter after an apostrophe word', () => {
    const term = toTerm(model(`l'équipe location:"d'abord" calendar:Perso urgent`));
    expect(parseQuery(term)).toMatchObject({
      text: ["l'équipe", 'urgent'],
      location: ["d'abord"],
      calendar: ['Perso'],
    });
  });
});

describe('lastOpenWord', () => {
  it('returns the word being typed, not a finished one', () => {
    expect(lastOpenWord('dentist pers')).toEqual({ text: 'pers', start: 8, closed: false });
    expect(lastOpenWord('dentist ')).toBeNull();
  });
});

describe('tokenFrom', () => {
  it('derives a stable id from the key and the value, ignoring case', () => {
    expect(tokenFrom('calendar', { value: 'Perso', label: 'Perso' }).id).toBe(
      tokenFrom('calendar', { value: 'perso', label: 'perso' }).id,
    );
    expect(tokenFrom('calendar', { value: 'perso', label: 'perso' }).id).not.toBe(
      tokenFrom('location', { value: 'perso', label: 'perso' }).id,
    );
  });
});
