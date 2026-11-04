import {
  appendText,
  appendToken,
  isQuoteOpen,
  lastOpenWord,
  makeToken,
  parseInput,
  tokenFrom,
  unquote,
} from './searchSyntax';

export type FilterKey = 'calendar' | 'attendee' | 'date' | 'title' | 'location' | 'description';
export type Token = { id: string; key: FilterKey; value: string; label: string; color?: string };
export type Segment = { kind: 'token'; token: Token } | { kind: 'text'; text: string };
export type SearchModel = { segments: Segment[]; input: string; pending: FilterKey | null; selectedId: string | null };
export type Resolved = { value: string; label: string; color?: string };
export type Resolve = (key: FilterKey, raw: string) => Resolved | null;

export type SearchAction =
  | { type: 'input'; text: string }
  | { type: 'startFilter'; key: FilterKey }
  | { type: 'commit'; resolved: Resolved }
  | { type: 'commitRaw' }
  | { type: 'backspaceEmpty' }
  | { type: 'select'; id: string }
  | { type: 'remove'; id: string }
  | { type: 'replaceLastWord'; key: FilterKey; resolved: Resolved }
  | { type: 'clear' }
  | { type: 'load'; model: SearchModel };

export const EMPTY_MODEL: SearchModel = { segments: [], input: '', pending: null, selectedId: null };

const FREE_VALUE_KEYS: readonly FilterKey[] = ['title', 'location', 'description'];

export function isEmptyModel(model: SearchModel): boolean {
  return model.segments.length === 0 && model.pending === null && model.input.trim() === '';
}

export function toStored(model: SearchModel): SearchModel {
  return { segments: model.segments, input: model.pending ? '' : model.input, pending: null, selectedId: null };
}

function commitToken(model: SearchModel, token: Token): SearchModel {
  return { segments: appendToken(model.segments, token), input: '', pending: null, selectedId: null };
}

function removeToken(model: SearchModel, id: string): SearchModel {
  return {
    ...model,
    segments: model.segments.filter((segment) => segment.kind !== 'token' || segment.token.id !== id),
    selectedId: null,
  };
}

function typePending(model: SearchModel, key: FilterKey, raw: string, resolve: Resolve): SearchModel {
  const text = model.input === '' ? raw.replace(/^\s+/, '') : raw;
  if (/\s$/.test(text) && !isQuoteOpen(text)) {
    const value = unquote(text);
    if (value && (FREE_VALUE_KEYS.includes(key) || resolve(key, value))) {
      return commitToken(model, makeToken(key, value, resolve));
    }
  }
  return { ...model, input: text, selectedId: null };
}

export function reduceSearch(model: SearchModel, action: SearchAction, resolve: Resolve): SearchModel {
  switch (action.type) {
    case 'input': {
      if (model.pending) return typePending(model, model.pending, action.text, resolve);
      const parsed = parseInput(action.text, resolve, model.segments);
      return parsed ? { ...parsed, selectedId: null } : { ...model, input: action.text, selectedId: null };
    }
    case 'startFilter':
      return {
        segments: appendText(model.segments, model.pending ? '' : model.input),
        input: '',
        pending: action.key,
        selectedId: null,
      };
    case 'commit':
      return model.pending ? commitToken(model, tokenFrom(model.pending, action.resolved)) : model;
    case 'commitRaw': {
      if (!model.pending) return model;
      const value = unquote(model.input);
      return value ? commitToken(model, makeToken(model.pending, value, resolve)) : { ...model, input: '', pending: null };
    }
    case 'backspaceEmpty': {
      if (model.pending) return { ...model, pending: null, input: '' };
      if (model.selectedId) return removeToken(model, model.selectedId);
      const last = model.segments[model.segments.length - 1];
      if (!last) return model;
      if (last.kind === 'token') return { ...model, selectedId: last.token.id };
      return { ...model, segments: model.segments.slice(0, -1), input: last.text.slice(0, -1) };
    }
    case 'select':
      return { ...model, selectedId: model.selectedId === action.id ? null : action.id };
    case 'remove':
      return removeToken(model, action.id);
    case 'replaceLastWord': {
      const word = lastOpenWord(model.input);
      const rest = word ? model.input.slice(0, word.start) : model.input;
      return commitToken({ ...model, segments: appendText(model.segments, rest) }, tokenFrom(action.key, action.resolved));
    }
    case 'clear':
      return EMPTY_MODEL;
    case 'load':
      return toStored(action.model);
  }
}
