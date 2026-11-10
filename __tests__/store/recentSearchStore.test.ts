import { useRecentSearchStore } from '@/stores/recentSearchStore';
import { EMPTY_MODEL, reduceSearch } from '@/features/search/searchModel';
import type { SearchModel } from '@/features/search/searchModel';

const typed = (text: string): SearchModel => reduceSearch(EMPTY_MODEL, { type: 'input', text }, () => null);
const terms = (accountId: string) =>
  useRecentSearchStore.getState().byAccount[accountId]?.map((recent) => recent.term);

beforeEach(() => useRecentSearchStore.setState({ byAccount: {} }));

it('keeps the five newest searches per account, newest first', () => {
  const { add } = useRecentSearchStore.getState();
  for (const word of ['a', 'b', 'c', 'd', 'e', 'f']) add('acc', typed(word));
  expect(terms('acc')).toEqual(['f', 'e', 'd', 'c', 'b']);
});

it('moves a repeated search to the top instead of duplicating it', () => {
  const { add } = useRecentSearchStore.getState();
  add('acc', typed('dentist'));
  add('acc', typed('calendar:perso '));
  add('acc', typed('dentist'));
  expect(terms('acc')).toEqual(['dentist', 'calendar:perso']);
});

it('ignores empty searches and keeps accounts apart', () => {
  const { add } = useRecentSearchStore.getState();
  add('acc', EMPTY_MODEL);
  add('other', typed('dentist'));
  expect(terms('acc')).toBeUndefined();
  expect(terms('other')).toEqual(['dentist']);
});

it('stores a search without its pending filter', () => {
  const pending = reduceSearch(typed('dentist'), { type: 'startFilter', key: 'calendar' }, () => null);
  useRecentSearchStore.getState().add('acc', pending);
  const [entry] = useRecentSearchStore.getState().byAccount.acc;
  expect(entry.model.pending).toBeNull();
  expect(entry.term).toBe('dentist');
});

it('removes one entry', () => {
  const { add } = useRecentSearchStore.getState();
  add('acc', typed('dentist'));
  add('acc', typed('lunch'));
  useRecentSearchStore.getState().remove('acc', 'dentist');
  expect(terms('acc')).toEqual(['lunch']);
});
