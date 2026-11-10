import { EMPTY_MODEL, isEmptyModel, reduceSearch, toStored } from '@/features/search/searchModel';
import type { Resolve, Resolved, SearchAction, SearchModel } from '@/features/search/searchModel';

const KNOWN: Record<string, Resolved> = {
  'calendar:perso': { value: 'Perso', label: 'Perso', color: '#D4537E' },
  'calendar:team work': { value: 'Team work', label: 'Team work', color: '#0082C9' },
  'attendee:alice martin': { value: 'alice@example.org', label: 'Alice Martin' },
  'attendee:alice@example.org': { value: 'alice@example.org', label: 'Alice Martin' },
};
const resolve: Resolve = (key, raw) => KNOWN[`${key}:${raw.toLowerCase()}`] ?? null;

const run = (...actions: SearchAction[]) =>
  actions.reduce<SearchModel>((model, action) => reduceSearch(model, action, resolve), EMPTY_MODEL);
const type = (text: string): SearchAction => ({ type: 'input', text });
const backspace: SearchAction = { type: 'backspaceEmpty' };
const parts = (model: SearchModel) =>
  model.segments.map((segment) =>
    segment.kind === 'token' ? `${segment.token.key}:${segment.token.value}` : `"${segment.text}"`,
  );
const firstTokenId = (model: SearchModel) => (model.segments[0].kind === 'token' ? model.segments[0].token.id : '');

it('keeps plain words in the input', () => {
  expect(run(type('dentist'))).toEqual({ ...EMPTY_MODEL, input: 'dentist' });
});

it('turns a typed key into a pending filter and freezes the text before it', () => {
  const model = run(type('dentist calendar:'));
  expect(parts(model)).toEqual(['"dentist"']);
  expect(model).toMatchObject({ pending: 'calendar', input: '' });
});

it('commits a pending value followed by a space when it is known', () => {
  const model = run(type('calendar:'), type('perso '));
  expect(parts(model)).toEqual(['calendar:Perso']);
  expect(model.segments[0]).toMatchObject({ token: { color: '#D4537E' } });
  expect(model).toMatchObject({ pending: null, input: '' });
});

it('keeps a space inside a value until the value is known', () => {
  const model = run(type('calendar:'), type('Team '));
  expect(model).toMatchObject({ pending: 'calendar', input: 'Team ' });
  expect(parts(reduceSearch(model, type('Team work '), resolve))).toEqual(['calendar:Team work']);
});

it('commits a free title value on space and keeps quoted spaces', () => {
  expect(parts(run(type('title:'), type('"two words" ')))).toEqual(['title:two words']);
  expect(run(type('title:'), type('"two '))).toMatchObject({ pending: 'title', input: '"two ' });
});

it('commits a location value on trailing space like title', () => {
  expect(parts(run(type('location:'), type('Paris ')))).toEqual(['location:Paris']);
});

it('drops a leading space on an empty value', () => {
  expect(run(type('calendar:'), type(' '))).toMatchObject({ pending: 'calendar', input: '' });
});

it('commits the typed value on Return, resolving its label', () => {
  const model = run(type('attendee:'), type('alice@example.org'), { type: 'commitRaw' });
  expect(model.segments[0]).toMatchObject({
    token: { key: 'attendee', value: 'alice@example.org', label: 'Alice Martin' },
  });
});

it('cancels an empty pending filter on Return', () => {
  expect(run(type('calendar:'), { type: 'commitRaw' })).toEqual(EMPTY_MODEL);
});

it('removes the whole pending key on backspace', () => {
  const model = run(type('dentist calendar:'), backspace);
  expect(parts(model)).toEqual(['"dentist"']);
  expect(model).toMatchObject({ pending: null, input: '' });
});

it('highlights then deletes the last token on backspace', () => {
  const highlighted = run(type('calendar:perso '), backspace);
  expect(highlighted.selectedId).toBe(firstTokenId(highlighted));
  expect(reduceSearch(highlighted, backspace, resolve).segments).toEqual([]);
});

it('reopens the last text on backspace, minus one character', () => {
  expect(run(type('dentist calendar:'), backspace, backspace)).toEqual({ ...EMPTY_MODEL, input: 'dentis' });
});

it('clears the highlight when typing', () => {
  expect(run(type('calendar:perso '), backspace, type('x'))).toMatchObject({ selectedId: null, input: 'x' });
});

it('selects, unselects and removes a token by id', () => {
  const model = run(type('calendar:perso '));
  const id = firstTokenId(model);
  const selected = reduceSearch(model, { type: 'select', id }, resolve);
  expect(selected.selectedId).toBe(id);
  expect(reduceSearch(selected, { type: 'select', id }, resolve).selectedId).toBeNull();
  expect(reduceSearch(selected, { type: 'remove', id }, resolve).segments).toEqual([]);
});

it('starts a filter from the menu, freezing the typed text', () => {
  const model = run(type('dentist'), { type: 'startFilter', key: 'attendee' });
  expect(parts(model)).toEqual(['"dentist"']);
  expect(model).toMatchObject({ pending: 'attendee', input: '' });
});

it('commits a picked suggestion', () => {
  const model = run(
    { type: 'startFilter', key: 'calendar' },
    { type: 'commit', resolved: { value: 'Perso', label: 'Perso' } },
  );
  expect(parts(model)).toEqual(['calendar:Perso']);
});

it('replaces the word being typed with a hint', () => {
  const model = run(type('dentist pers'), {
    type: 'replaceLastWord',
    key: 'calendar',
    resolved: { value: 'Perso', label: 'Perso' },
  });
  expect(parts(model)).toEqual(['"dentist"', 'calendar:Perso']);
  expect(model.input).toBe('');
});

it('parses pasted syntax into tokens and text', () => {
  const model = run(type('calendar:perso attendee:"Alice Martin" dentist'));
  expect(parts(model)).toEqual(['calendar:Perso', 'attendee:alice@example.org']);
  expect(model.input).toBe('dentist');
});

it('does not add the same filter twice', () => {
  expect(parts(run(type('calendar:perso '), type('calendar:PERSO ')))).toEqual(['calendar:Perso']);
});

it('clears everything and loads a stored search without its pending filter', () => {
  expect(run(type('calendar:perso '), { type: 'clear' })).toEqual(EMPTY_MODEL);
  const stored = run(type('dentist calendar:'), type('per'));
  expect(run({ type: 'load', model: stored })).toMatchObject({ pending: null, input: '', selectedId: null });
});

it('knows when a model is empty', () => {
  expect(isEmptyModel(EMPTY_MODEL)).toBe(true);
  expect(isEmptyModel({ ...EMPTY_MODEL, input: '   ' })).toBe(true);
  expect(isEmptyModel(run({ type: 'startFilter', key: 'calendar' }))).toBe(false);
  expect(toStored(run(type('dentist calendar:'), type('per')))).toMatchObject({ pending: null, input: '' });
});
