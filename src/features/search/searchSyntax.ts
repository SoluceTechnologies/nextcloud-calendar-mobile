import type { FilterKey, Resolve, Resolved, SearchModel, Segment, Token } from './searchModel';

export const FILTER_KEYS: readonly FilterKey[] = ['calendar', 'attendee', 'date', 'title', 'location', 'description'];

export type Word = { text: string; start: number; closed: boolean };
export type ParsedInput = { segments: Segment[]; input: string; pending: FilterKey | null };

export function splitWords(input: string): Word[] {
  const words: Word[] = [];
  let current = '';
  let start = -1;
  let quoted = false;
  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (quoted) {
      if (character === '"') quoted = false;
      else current += character;
      continue;
    }
    if (character === '"') {
      if (start === -1) start = index;
      quoted = true;
      continue;
    }
    if (/\s/.test(character)) {
      if (start !== -1) words.push({ text: current, start, closed: true });
      current = '';
      start = -1;
      continue;
    }
    if (start === -1) start = index;
    current += character;
  }
  if (start !== -1) words.push({ text: current, start, closed: false });
  return words;
}

export function matchKey(word: string): { key: FilterKey; value: string } | null {
  const colon = word.indexOf(':');
  if (colon <= 0) return null;
  const key = word.slice(0, colon).toLowerCase() as FilterKey;
  return FILTER_KEYS.includes(key) ? { key, value: word.slice(colon + 1) } : null;
}

export function tokenFrom(key: FilterKey, resolved: Resolved): Token {
  return { id: `${key}:${resolved.value.toLowerCase()}`, key, value: resolved.value, label: resolved.label, color: resolved.color };
}

export function makeToken(key: FilterKey, value: string, resolve: Resolve): Token {
  return tokenFrom(key, resolve(key, value) ?? { value, label: value });
}

export function appendText(segments: Segment[], raw: string): Segment[] {
  const text = raw.trim();
  if (!text) return segments;
  const last = segments[segments.length - 1];
  if (last?.kind === 'text') return [...segments.slice(0, -1), { kind: 'text', text: `${last.text} ${text}` }];
  return [...segments, { kind: 'text', text }];
}

export function appendToken(segments: Segment[], token: Token): Segment[] {
  const exists = segments.some(
    (segment) =>
      segment.kind === 'token' &&
      segment.token.key === token.key &&
      segment.token.value.toLowerCase() === token.value.toLowerCase(),
  );
  return exists ? segments : [...segments, { kind: 'token', token }];
}

export function parseInput(text: string, resolve: Resolve, base: Segment[] = []): ParsedInput | null {
  const words = splitWords(text);
  const last = words.length - 1;
  let segments = base;
  let textStart = 0;
  let changed = false;
  for (let index = 0; index < words.length; index++) {
    const match = matchKey(words[index].text);
    if (!match) continue;
    if (index === last && !words[index].closed) {
      return {
        segments: appendText(segments, text.slice(textStart, words[index].start)),
        input: match.value,
        pending: match.key,
      };
    }
    if (match.value === '') continue;
    segments = appendToken(
      appendText(segments, text.slice(textStart, words[index].start)),
      makeToken(match.key, match.value, resolve),
    );
    textStart = index < last ? words[index + 1].start : text.length;
    changed = true;
  }
  return changed ? { segments, input: text.slice(textStart), pending: null } : null;
}

export function isQuoteOpen(value: string): boolean {
  return (value.match(/"/g) ?? []).length % 2 === 1;
}

export function unquote(value: string): string {
  return value.trim().replace(/^"|"$/g, '').trim();
}

export function lastOpenWord(input: string): Word | null {
  const words = splitWords(input);
  const last = words[words.length - 1];
  return last && !last.closed ? last : null;
}

export function quoteValue(value: string): string {
  return /[\s"']/.test(value) ? `"${value.replace(/"/g, '')}"` : value;
}

export function toTerm(model: SearchModel): string {
  const parts: string[] = [];
  for (const segment of model.segments) {
    if (segment.kind === 'text') parts.push(segment.text);
    else parts.push(`${segment.token.key}:${quoteValue(segment.token.value)}`);
  }
  const input = model.input.trim();
  if (!model.pending && input) parts.push(input);
  return parts.join(' ');
}
