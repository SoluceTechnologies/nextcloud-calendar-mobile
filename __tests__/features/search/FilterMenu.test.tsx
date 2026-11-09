import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { FilterMenu } from '@/features/search/components/FilterMenu';
import { EMPTY_MODEL, reduceSearch } from '@/features/search/searchModel';
import type { RecentSearch } from '@/stores/recentSearchStore';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (key: string) => key }),
}));

const entry: RecentSearch = {
  id: 'calendar:perso dentist',
  term: 'calendar:perso dentist',
  model: reduceSearch(EMPTY_MODEL, { type: 'input', text: 'calendar:perso dentist' }, () => null),
  at: 0,
};

function setup(recent: RecentSearch[] = []) {
  const handlers = { onStart: jest.fn(), onLoadRecent: jest.fn(), onRemoveRecent: jest.fn() };
  render(<FilterMenu recent={recent} {...handlers} />, { wrapper: ThemeWrapper });
  return handlers;
}

it('lists the three main filters and reveals the others on demand', () => {
  setup();
  for (const key of ['calendar', 'attendee', 'date']) {
    expect(screen.getByTestId(`filter-${key}`)).toBeTruthy();
  }
  expect(screen.queryByTestId('filter-title')).toBeNull();
  fireEvent.press(screen.getByTestId('filter-more'));
  for (const key of ['title', 'location', 'description']) {
    expect(screen.getByTestId(`filter-${key}`)).toBeTruthy();
  }
  expect(screen.queryByTestId('filter-more')).toBeNull();
});

it('starts a filter from its row and shows its syntax', () => {
  const handlers = setup();
  expect(screen.getByText('calendar: search.hint.name')).toBeTruthy();
  expect(screen.getByText('attendee: search.hint.person')).toBeTruthy();
  expect(screen.getByText('date: today')).toBeTruthy();
  fireEvent.press(screen.getByTestId('filter-calendar'));
  expect(handlers.onStart).toHaveBeenCalledWith('calendar');
});

it('loads and removes a recent search', () => {
  const handlers = setup([entry]);
  expect(screen.getByText('search.recent')).toBeTruthy();
  fireEvent.press(screen.getByTestId('recent-calendar:perso dentist'));
  expect(handlers.onLoadRecent).toHaveBeenCalledWith(entry);
  fireEvent.press(screen.getByLabelText('search.removeRecent'));
  expect(handlers.onRemoveRecent).toHaveBeenCalledWith(entry);
});

it('offers removal of a recent search as an accessibility action', () => {
  const handlers = setup([entry]);
  const row = screen.getByTestId('recent-calendar:perso dentist');
  expect(row).toHaveProp('accessibilityActions', [{ name: 'delete', label: 'search.removeRecent' }]);
  row.props.onAccessibilityAction({ nativeEvent: { actionName: 'delete' } });
  expect(handlers.onRemoveRecent).toHaveBeenCalledWith(entry);
});

it('hides the recent section when there is none', () => {
  setup();
  expect(screen.queryByText('search.recent')).toBeNull();
});
