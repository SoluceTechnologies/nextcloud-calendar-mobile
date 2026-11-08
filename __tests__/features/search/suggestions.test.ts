import { buildHints, buildValueSuggestions, resolveValue, type SuggestionData } from '@/features/search/suggestions';

const data: SuggestionData = {
  calendars: [
    { name: 'Work', color: '#0082c9' },
    { name: 'Perso', color: '#e9322d' },
  ],
  people: [
    { email: 'Alice@Example.org', displayName: 'Alice Martin' },
    { email: 'alice@example.org', displayName: 'Alice Martin' },
    { email: 'bob@example.org' },
  ],
};

it('lists calendars sharing a name once, keeping the first name and color', () => {
  const calendars: SuggestionData = {
    ...data,
    calendars: [
      { name: 'Tasks', color: '#0082c9' },
      { name: 'tasks', color: '#e9322d' },
      { name: 'Birthdays', color: null },
    ],
  };
  expect(buildValueSuggestions('calendar', '', calendars)).toEqual([
    { key: 'calendar', value: 'Birthdays', label: 'Birthdays', color: undefined },
    { key: 'calendar', value: 'Tasks', label: 'Tasks', color: '#0082c9' },
  ]);
});

it('dedupes attendees by email and labels them by display name', () => {
  expect(buildValueSuggestions('attendee', '', data)).toEqual([
    { key: 'attendee', value: 'alice@example.org', label: 'Alice Martin', detail: 'Alice@Example.org' },
    { key: 'attendee', value: 'bob@example.org', label: 'bob@example.org', detail: 'bob@example.org' },
  ]);
});

it('ranks matches that start with the typed text first', () => {
  const calendars: SuggestionData = {
    ...data,
    calendars: [{ name: 'Team design' }, { name: 'Design reviews' }, { name: 'Marketing' }],
  };
  expect(buildValueSuggestions('calendar', 'design', calendars).map((suggestion) => suggestion.label)).toEqual([
    'Design reviews',
    'Team design',
  ]);
});

it('keeps the date presets in order and filters them', () => {
  expect(buildValueSuggestions('date', '', data).map((suggestion) => suggestion.value)).toEqual([
    'today', 'tomorrow', 'week', 'month', 'upcoming', 'past',
  ]);
  expect(buildValueSuggestions('date', 'o', data).map((suggestion) => suggestion.value)).toEqual([
    'today', 'tomorrow', 'month', 'upcoming',
  ]);
});

it('offers nothing for free text keys and caps long lists', () => {
  expect(buildValueSuggestions('title', 'x', data)).toEqual([]);
  expect(buildValueSuggestions('location', 'x', data)).toEqual([]);
  expect(buildValueSuggestions('description', 'x', data)).toEqual([]);
  const many: SuggestionData = {
    ...data,
    calendars: Array.from({ length: 25 }, (_, index) => ({ name: `Calendar ${index}` })),
  };
  expect(buildValueSuggestions('calendar', '', many)).toHaveLength(20);
});

it('resolves an exact label or value, case-insensitively', () => {
  expect(resolveValue('attendee', 'alice martin', data)).toEqual({ value: 'alice@example.org', label: 'Alice Martin' });
  expect(resolveValue('attendee', 'ALICE@example.org', data)).toEqual({
    value: 'alice@example.org',
    label: 'Alice Martin',
  });
  expect(resolveValue('calendar', 'WORK', data)).toEqual({ value: 'Work', label: 'Work', color: '#0082c9' });
  expect(resolveValue('calendar', 'wo', data)).toBeNull();
  expect(resolveValue('date', 'upcoming', data)).toEqual({ value: 'upcoming', label: 'upcoming' });
  expect(resolveValue('date', '<2026-10-01', data)).toEqual({ value: '<2026-10-01', label: '<2026-10-01' });
  expect(resolveValue('location', 'paris', data)).toBeNull();
});

it('ranks hints that start with the word first, across keys, and keeps three', () => {
  const many: SuggestionData = {
    calendars: [{ name: 'Marketing' }, { name: 'Big mark' }],
    people: [
      { email: 'martin@example.org', displayName: 'Martin Dupont' },
      { email: 'amar@example.org', displayName: 'Amar' },
    ],
  };
  expect(buildHints('mar', many, []).map((suggestion) => `${suggestion.key}:${suggestion.label}`)).toEqual([
    'calendar:Marketing',
    'attendee:Martin Dupont',
    'attendee:Amar',
  ]);
});

it('suggests filters for a typed word, skipping those already present, from two characters', () => {
  expect(buildHints('wo', data, []).map((suggestion) => `${suggestion.key}:${suggestion.value}`)).toEqual([
    'calendar:Work',
  ]);
  expect(buildHints('wo', data, [{ key: 'calendar', value: 'work' }])).toEqual([]);
  expect(buildHints('w', data, [])).toEqual([]);
});
