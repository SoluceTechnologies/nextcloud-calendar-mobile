import type { FilterKey, Resolved } from './searchModel';

export type Suggestion = Resolved & { key: FilterKey; detail?: string };

export type SuggestionData = {
  calendars: { name: string; color?: string | null }[];
  people: { email: string; displayName?: string }[];
};

export const DATE_PRESETS = ['today', 'tomorrow', 'week', 'month', 'upcoming', 'past'] as const;

const MAX_VALUES = 20;
const MAX_HINTS = 3;
const DATED = /^[<>]=?\d{4}-\d{2}-\d{2}$/;

function allValues(key: FilterKey, data: SuggestionData): Suggestion[] {
  switch (key) {
    case 'calendar': {
      const calendars = new Map<string, Suggestion>();
      for (const calendar of data.calendars) {
        const id = calendar.name.toLocaleLowerCase();
        if (calendars.has(id)) continue;
        calendars.set(id, { key, value: calendar.name, label: calendar.name, color: calendar.color ?? undefined });
      }
      return [...calendars.values()];
    }
    case 'attendee': {
      const people = new Map<string, Suggestion>();
      for (const person of data.people) {
        const email = person.email.toLowerCase();
        if (people.has(email)) continue;
        people.set(email, { key, value: email, label: person.displayName || person.email, detail: person.email });
      }
      return [...people.values()];
    }
    case 'date':
      return DATE_PRESETS.map((preset) => ({ key, value: preset, label: preset }));
    default:
      return [];
  }
}

function rank(suggestion: Suggestion, query: string): number {
  if (!query) return 1;
  const label = suggestion.label.toLocaleLowerCase();
  const value = suggestion.value.toLocaleLowerCase();
  if (label.startsWith(query) || value.startsWith(query)) return 0;
  if (label.includes(query) || value.includes(query)) return 1;
  return -1;
}

export function buildValueSuggestions(key: FilterKey, typed: string, data: SuggestionData): Suggestion[] {
  const query = typed.trim().toLocaleLowerCase();
  const matching = allValues(key, data).filter((suggestion) => rank(suggestion, query) >= 0);
  if (key !== 'date') {
    matching.sort((first, second) => rank(first, query) - rank(second, query) || first.label.localeCompare(second.label));
  }
  return matching.slice(0, MAX_VALUES);
}

export function resolveValue(key: FilterKey, raw: string, data: SuggestionData): Resolved | null {
  const query = raw.trim().toLocaleLowerCase();
  if (!query) return null;
  if (key === 'date' && DATED.test(query)) return { value: query, label: query };
  const hit = allValues(key, data).find(
    (suggestion) => suggestion.label.toLocaleLowerCase() === query || suggestion.value.toLocaleLowerCase() === query,
  );
  return hit ? { value: hit.value, label: hit.label, color: hit.color } : null;
}

export function buildHints(
  word: string,
  data: SuggestionData,
  present: { key: FilterKey; value: string }[],
): Suggestion[] {
  const query = word.trim().toLocaleLowerCase();
  if (query.length < 2) return [];
  const taken = new Set(present.map((token) => `${token.key}:${token.value.toLocaleLowerCase()}`));
  const startsFirst = (suggestion: Suggestion) => Number(!suggestion.label.toLocaleLowerCase().startsWith(query));
  return (['calendar', 'attendee'] as const)
    .flatMap((key) => allValues(key, data))
    .filter(
      (suggestion) =>
        suggestion.label.toLocaleLowerCase().includes(query) &&
        !taken.has(`${suggestion.key}:${suggestion.value.toLocaleLowerCase()}`),
    )
    .sort((first, second) => startsFirst(first) - startsFirst(second) || first.label.localeCompare(second.label))
    .slice(0, MAX_HINTS);
}
