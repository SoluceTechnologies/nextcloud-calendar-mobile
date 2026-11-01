import type { ReactElement } from 'react';
import { fireEvent, render as rtlRender, waitFor, within } from '@testing-library/react-native';
import { ThemeWrapper } from '../../helpers/theme';

const render = (ui: ReactElement, opts?: Parameters<typeof rtlRender>[1]) =>
  rtlRender(ui, { wrapper: ThemeWrapper, ...opts });

import { FindTimeSheet } from '@/features/event/components/FindTimeSheet';
import i18n from '@/utils/i18n';
import type { Account, Attendee } from '@/types';

jest.mock('@/services/nextcloud/freeBusy', () => ({
  fetchFreeBusy: jest.fn(),
}));

import { fetchFreeBusy } from '@/services/nextcloud/freeBusy';

const mockedFetchFreeBusy = fetchFreeBusy as jest.MockedFunction<typeof fetchFreeBusy>;

const account: Account = {
  id: 'acc-1',
  displayName: 'Work',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'xxxx',
  davUserId: 'john',
};

const organizer: Attendee = { email: 'john@example.com', displayName: 'John' };
const attendees: Attendee[] = [
  { email: 'testuser@example.local', displayName: 'Testuser' },
  { email: 'bob@example.local', displayName: 'Bob' },
];

function slot(startIso: string, endIso: string, attendees?: string[]) {
  return {
    start: new Date(startIso),
    end: new Date(endIso),
    fbType: 'BUSY' as const,
    attendees,
  };
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  jest.clearAllMocks();
});

it('removes Bob chip from the timeline when Bob is marked optional', async () => {
  mockedFetchFreeBusy.mockResolvedValue([
    {
      email: 'testuser@example.local',
      displayName: 'Testuser',
      slots: [slot('2026-08-26T12:00:00Z', '2026-08-26T13:00:00Z', ['testuser@example.local'])],
      available: true,
      color: '#E53935',
    },
    {
      email: 'bob@example.local',
      displayName: 'Bob',
      slots: [slot('2026-08-26T13:00:00Z', '2026-08-26T14:00:00Z', ['bob@example.local'])],
      available: true,
      color: '#1E88E5',
    },
  ]);

  const { getByText, getByTestId } = render(
    <FindTimeSheet
      visible
      onClose={jest.fn()}
      account={account}
      organizer={organizer}
      attendees={attendees}
      start={new Date('2026-08-26T12:00:00Z')}
      end={new Date('2026-08-26T13:00:00Z')}
      onApplySlot={jest.fn()}
    />,
  );

  await waitFor(() => expect(getByText('Some may be busy')).toBeTruthy());

  // Switch to permissive mode.
  fireEvent.press(getByText('Some may be busy'));

  const busyBlock = await waitFor(() => getByTestId('busy-block-7-0'));
  const busyView = within(busyBlock);
  expect(busyView.getByText('Testuser')).toBeTruthy();
  expect(busyView.getByText('Bob')).toBeTruthy();

  // Toggle Bob off.
  fireEvent(getByTestId('required-toggle-bob@example.local'), 'valueChange', {
    nativeEvent: { value: false },
  });

  await waitFor(() => expect(busyView.queryByText('Bob')).toBeNull());
  expect(busyView.getByText('Testuser')).toBeTruthy();
});
