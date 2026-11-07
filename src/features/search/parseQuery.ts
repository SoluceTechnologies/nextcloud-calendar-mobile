export type DateComparator = '<' | '<=' | '>' | '>=' | '=';
export type DateTerm = { comparator: DateComparator; value: string };

export type SearchQuery = {
  title: string[];
  description: string[];
  location: string[];
  calendar: string[];
  attendee: string[];
  date: DateTerm[];
  text: string[];
};

const KEYS = ['title', 'description', 'location', 'calendar', 'attendee', 'date'] as const;
type Key = (typeof KEYS)[number];

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: string | null = null;
  let sawQuote = false;

  for (const character of input) {
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === '"' || (character === "'" && (current === '' || current.endsWith(':')))) {
      quote = character;
      sawQuote = true;
      continue;
    }
    if (/\s/.test(character)) {
      if (current.length > 0 || sawQuote) tokens.push(current);
      current = '';
      sawQuote = false;
      continue;
    }
    current += character;
  }
  if (current.length > 0 || sawQuote) tokens.push(current);
  return tokens;
}

function parseDate(raw: string): DateTerm {
  const match = /^(<=|>=|<|>|=)?(.*)$/.exec(raw);
  const comparator = (match?.[1] as DateComparator | undefined) ?? '=';
  return { comparator, value: match?.[2] ?? '' };
}

export function parseQuery(input: string): SearchQuery {
  const query: SearchQuery = { title: [], description: [], location: [], calendar: [], attendee: [], date: [], text: [] };

  for (const token of tokenize(input)) {
    const colon = token.indexOf(':');
    const name = colon === -1 ? null : token.slice(0, colon).toLowerCase();
    if (name && (KEYS as readonly string[]).includes(name)) {
      const value = token.slice(colon + 1);
      if (name === 'date') query.date.push(parseDate(value));
      else query[name as Exclude<Key, 'date'>].push(value);
      continue;
    }
    query.text.push(token);
  }

  return query;
}

export function isEmptyQuery(query: SearchQuery): boolean {
  return (
    query.title.length + query.description.length + query.location.length + query.calendar.length +
      query.attendee.length + query.date.length + query.text.length === 0
  );
}
