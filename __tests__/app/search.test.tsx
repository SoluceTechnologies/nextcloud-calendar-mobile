import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useIsFocused } from 'expo-router';

import { ThemeWrapper } from '../helpers/theme';
import SearchScreen from '../../app/(tabs)/search/index';
import { setAccounts } from '@/hooks/useAccounts';
import { useAccountStore } from '@/stores/accountStore';
import { useCalendarStore } from '@/stores/calendarStore';
import { useRecentSearchStore } from '@/stores/recentSearchStore';
import { useEventsForRange } from '@/database/useEvents';
import { useCalendarsFromDb } from '@/database/useCalendars';
import { useRemoteSearch } from '@/features/search/useRemoteSearch';
import { openServerHit } from '@/features/search/openServerHit';
import { useIsOnline } from '@/services/shared/network';
import type { Account, CalendarEvent, CalendarMeta } from '@/types';

jest.mock('@/database/useEvents', () => ({ useEventsForRange: jest.fn(() => []) }));
jest.mock('@/database/useCalendars', () => ({ useCalendarsFromDb: jest.fn(() => []) }));
jest.mock('@/features/search/useRemoteSearch', () => ({
  useRemoteSearch: jest.fn(() => ({ entries: [], loading: false, failed: false })),
}));
jest.mock('@/features/search/openServerHit', () => ({ openServerHit: jest.fn() }));
jest.mock('@/services/shared/network', () => ({ useIsOnline: jest.fn(() => true) }));
jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => {
  const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
  return {
    ...jest.requireActual('expo-router'),
    router: mockRouter,
    useRouter: () => mockRouter,
    useIsFocused: jest.fn(() => true),
  };
});

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const now = Date.now();

const account: Account = {
  id: 'a1',
  displayName: 'Work',
  baseUrl: 'https://cloud.test',
  username: 'alice',
  appPassword: 'secret',
  davUserId: 'alice',
};

function makeCalendar(id: string, displayName: string): CalendarMeta {
  return {
    id,
    accountId: 'a1',
    displayName,
    color: id === 'work' ? '#0082c9' : '#e9322d',
    ctag: '',
    url: `https://cloud.test/remote.php/dav/calendars/alice/${id}/`,
    slug: id,
  };
}

function makeEvent(uid: string, calendarId: string, summary: string, start: number): CalendarEvent {
  return {
    uid,
    href: `https://cloud.test/remote.php/dav/calendars/alice/${calendarId}/${uid}.ics`,
    calendarId,
    accountId: 'a1',
    summary,
    dtstart: new Date(start),
    dtend: new Date(start + HOUR_MS),
    allDay: false,
    color: '#0082c9',
    attendees: [],
    isRecurring: false,
  };
}

const events = [
  makeEvent('lunch-work', 'work', 'Team lunch', now + DAY_MS),
  makeEvent('lunch-perso', 'perso', 'Team lunch', now + 2 * DAY_MS),
  makeEvent('dentist', 'perso', 'Dentist', now + 3 * DAY_MS),
];

const toBase64 = (text: string) => Buffer.from(text).toString('base64');
const serverEntry = (path: string, title: string) => ({
  title,
  subline: 'Nov 15, 2023',
  resourceUrl: `https://cloud.test/apps/calendar/edit/${toBase64(path)}`,
  start: new Date(2023, 10, 15, 12),
});
const knownEntry = serverEntry('/remote.php/dav/calendars/alice/work/lunch-work.ics', 'Team lunch');
const oldEntry = serverEntry('/remote.php/dav/calendars/alice/work/old.ics', 'Old lunch');

const renderScreen = () => render(<SearchScreen />, { wrapper: ThemeWrapper });
const input = () => screen.getByTestId('search-input');
const recentTerms = () => (useRecentSearchStore.getState().byAccount.a1 ?? []).map((recent) => recent.term);

beforeEach(() => {
  jest.clearAllMocks();
  (useIsFocused as jest.Mock).mockReturnValue(true);
  (useIsOnline as jest.Mock).mockReturnValue(true);
  (useEventsForRange as jest.Mock).mockImplementation((accountId: string) => (accountId ? events : []));
  (useCalendarsFromDb as jest.Mock).mockImplementation((accountId: string | null) =>
    accountId ? [makeCalendar('work', 'Work'), makeCalendar('perso', 'Perso')] : [],
  );
  (useRemoteSearch as jest.Mock).mockReturnValue({ entries: [], loading: false, failed: false });
  act(() => {
    setAccounts([account]);
    useAccountStore.getState().setActiveAccountId('a1');
    useRecentSearchStore.setState({ byAccount: {} });
    useCalendarStore.setState({ hiddenCalendarIds: [] });
  });
});

it('shows the filter menu when empty', () => {
  renderScreen();
  for (const key of ['calendar', 'attendee', 'date']) {
    expect(screen.getByTestId(`filter-${key}`)).toBeTruthy();
  }
});

it('typing a title lists the event under Upcoming', async () => {
  renderScreen();
  fireEvent.changeText(input(), 'dentist');
  expect(await screen.findByTestId('result-event-dentist')).toBeTruthy();
  expect(screen.getByText('search.upcoming')).toBeTruthy();
  expect(screen.queryByTestId('result-event-lunch-work')).toBeNull();
});

it('a calendar pill hides events from other calendars', async () => {
  renderScreen();
  fireEvent.changeText(input(), 'team');
  expect(await screen.findByTestId('result-event-lunch-perso')).toBeTruthy();
  fireEvent.press(screen.getByText('search.short.calendar'));
  fireEvent.press(screen.getByTestId('suggestion-Work'));
  expect(screen.getByTestId('token-calendar-Work')).toBeTruthy();
  await waitFor(() => expect(screen.queryByTestId('result-event-lunch-perso')).toBeNull());
  expect(screen.getByTestId('result-event-lunch-work')).toBeTruthy();
});

it('opening a result saves a recent search and pushes /event/<uid>', async () => {
  renderScreen();
  fireEvent.changeText(input(), 'dentist');
  fireEvent.press(await screen.findByTestId('result-event-dentist'));
  expect(router.push).toHaveBeenCalledWith('/event/dentist');
  expect(recentTerms()).toEqual(['dentist']);
});

it('lists a server-only hit under More from the server and hides one already local', async () => {
  (useRemoteSearch as jest.Mock).mockReturnValue({ entries: [knownEntry, oldEntry], loading: false, failed: false });
  renderScreen();
  fireEvent.changeText(input(), 'lunch');
  expect(await screen.findByText('Old lunch')).toBeTruthy();
  expect(screen.getByText('search.fromServer')).toBeTruthy();
  expect(screen.getAllByText('Team lunch')).toHaveLength(2);
  expect(useRemoteSearch).toHaveBeenLastCalledWith('a1', { term: 'lunch' });
});

it('tapping a server hit calls openServerHit then pushes its uid; failure shows an alert', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  (useRemoteSearch as jest.Mock).mockReturnValue({ entries: [oldEntry], loading: false, failed: false });
  (openServerHit as jest.Mock).mockResolvedValueOnce('old_occ_1700049600');
  renderScreen();
  fireEvent.changeText(input(), 'lunch');
  const row = await screen.findByTestId('result-server-/remote.php/dav/calendars/alice/work/old.ics');

  fireEvent.press(row);
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/event/old_occ_1700049600'));
  expect((openServerHit as jest.Mock).mock.calls[0][0]).toEqual(account);
  expect((openServerHit as jest.Mock).mock.calls[0][1]).toMatchObject({
    href: 'https://cloud.test/remote.php/dav/calendars/alice/work/old.ics',
    calendar: { id: 'work' },
  });
  expect(recentTerms()).toEqual(['lunch']);

  (openServerHit as jest.Mock).mockRejectedValueOnce(new Error('boom'));
  fireEvent.press(screen.getByTestId('result-server-/remote.php/dav/calendars/alice/work/old.ics'));
  await waitFor(() => expect(alert).toHaveBeenCalledWith('search.openFailed'));
  expect(router.push).toHaveBeenCalledTimes(1);
});

it('hiding a calendar removes its local rows and server hit', async () => {
  (useRemoteSearch as jest.Mock).mockReturnValue({ entries: [oldEntry], loading: false, failed: false });
  renderScreen();
  fireEvent.changeText(input(), 'lunch');
  expect(await screen.findByText('Old lunch')).toBeTruthy();
  act(() => useCalendarStore.setState({ hiddenCalendarIds: ['work'] }));
  await waitFor(() => expect(screen.queryByText('Old lunch')).toBeNull());
  expect(screen.queryByTestId('result-event-lunch-work')).toBeNull();
  expect(screen.getByTestId('result-event-lunch-perso')).toBeTruthy();
});

it('shows the offline note when offline', async () => {
  (useIsOnline as jest.Mock).mockReturnValue(false);
  renderScreen();
  fireEvent.changeText(input(), 'dentist');
  expect(await screen.findByText('search.offlineNote')).toBeTruthy();
});

it('shows the empty state when nothing matches', async () => {
  renderScreen();
  fireEvent.changeText(input(), 'plumber');
  expect(await screen.findByTestId('search-empty')).toBeTruthy();
});

it('does not subscribe to events while unfocused', () => {
  (useIsFocused as jest.Mock).mockReturnValue(false);
  renderScreen();
  fireEvent.changeText(input(), 'dentist');
  for (const [accountId] of (useEventsForRange as jest.Mock).mock.calls) expect(accountId).toBe('');
  for (const [accountId] of (useRemoteSearch as jest.Mock).mock.calls) expect(accountId).toBeNull();
});
