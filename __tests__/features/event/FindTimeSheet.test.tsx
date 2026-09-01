import type { ReactElement } from 'react';
import { render as rtlRender, waitFor } from '@testing-library/react-native';
import { ThemeWrapper } from '../../helpers/theme';

const render = (ui: ReactElement, opts?: Parameters<typeof rtlRender>[1]) =>
  rtlRender(ui, { wrapper: ThemeWrapper, ...opts });

import { FindTimeSheet } from '@/features/event/components/FindTimeSheet';
import { useFreeBusy } from '@/features/event/hooks/useFreeBusy';
import i18n from '@/utils/i18n';
import type { Account, Attendee, BusySlot } from '@/types';

jest.mock('@/features/event/hooks/useFreeBusy', () => ({
  useFreeBusy: jest.fn(),
}));

const mockedUseFreeBusy = useFreeBusy as jest.MockedFunction<typeof useFreeBusy>;

const account: Account = {
  id: 'acc-1',
  displayName: 'Work',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'xxxx',
  davUserId: 'john',
};

const organizer: Attendee = { email: 'john@example.com', displayName: 'John' };
const attendees: Attendee[] = [{ email: 'jane@example.com', displayName: 'Jane' }];

const searchStart = new Date('2026-08-28T00:00:00Z');
const searchEnd = new Date('2026-09-04T00:00:00Z');
const busySlots: BusySlot[] = [
  { start: new Date('2026-08-28T10:00:00Z'), end: new Date('2026-08-28T10:30:00Z'), fbType: 'BUSY' },
];

beforeEach(async () => {
  await i18n.changeLanguage('en');
  jest.clearAllMocks();
});

describe('FindTimeSheet', () => {
  it('shows loading spinner when loading', async () => {
    mockedUseFreeBusy.mockReturnValue({
      loading: true,
      error: null,
      availabilities: [],
      suggestions: [],
      mergedBusy: [],
      searchStart: null,
      searchEnd: null,
      refetch: jest.fn(),
    });

    const { getByText } = render(
      <FindTimeSheet
        visible={true}
        onClose={jest.fn()}
        account={account}
        organizer={organizer}
        attendees={attendees}
        start={new Date('2026-08-28T10:00:00Z')}
        end={new Date('2026-08-28T11:00:00Z')}
        onApplySlot={jest.fn()}
      />,
    );

    await waitFor(() => expect(getByText('Checking availability…')).toBeTruthy());
  });

  it('shows error message on error', async () => {
    mockedUseFreeBusy.mockReturnValue({
      loading: false,
      error: new Error('Server error'),
      availabilities: [],
      suggestions: [],
      mergedBusy: [],
      searchStart: null,
      searchEnd: null,
      refetch: jest.fn(),
    });

    const { getByText } = render(
      <FindTimeSheet
        visible={true}
        onClose={jest.fn()}
        account={account}
        organizer={organizer}
        attendees={attendees}
        start={new Date('2026-08-28T10:00:00Z')}
        end={new Date('2026-08-28T11:00:00Z')}
        onApplySlot={jest.fn()}
      />,
    );

    await waitFor(() => expect(getByText('Could not fetch availability. The server may have free/busy disabled.')).toBeTruthy());
  });

  it('shows no slots message when searchStart is null', async () => {
    mockedUseFreeBusy.mockReturnValue({
      loading: false,
      error: null,
      availabilities: [],
      suggestions: [],
      mergedBusy: [],
      searchStart: null,
      searchEnd: null,
      refetch: jest.fn(),
    });

    const { getByText } = render(
      <FindTimeSheet
        visible={true}
        onClose={jest.fn()}
        account={account}
        organizer={organizer}
        attendees={attendees}
        start={new Date('2026-08-28T10:00:00Z')}
        end={new Date('2026-08-28T11:00:00Z')}
        onApplySlot={jest.fn()}
      />,
    );

    await waitFor(() => expect(getByText('No free slots found in the 15-day window.')).toBeTruthy());
  });

  it('renders timeline and attendee availability when data is available', async () => {
    mockedUseFreeBusy.mockReturnValue({
      loading: false,
      error: null,
      availabilities: [
        { email: 'jane@example.com', displayName: 'Jane', slots: busySlots, available: true, color: '#E53935' },
      ],
      suggestions: [{ start: new Date('2026-08-28T12:00:00Z'), end: new Date('2026-08-28T13:00:00Z') }],
      mergedBusy: busySlots,
      searchStart,
      searchEnd,
      refetch: jest.fn(),
    });

    const { getByText, getByTestId } = render(
      <FindTimeSheet
        visible={true}
        onClose={jest.fn()}
        account={account}
        organizer={organizer}
        attendees={attendees}
        start={new Date('2026-08-28T10:00:00Z')}
        end={new Date('2026-08-28T11:00:00Z')}
        eventTitle="Planning"
        onApplySlot={jest.fn()}
      />,
    );

    await waitFor(() => expect(getByText('Attendee availability')).toBeTruthy());
    expect(getByText('Jane')).toBeTruthy();
    expect(getByText('Available')).toBeTruthy();
    // Timeline is rendered
    expect(getByTestId('event-brick')).toBeTruthy();
  });

  it('shows Unknown for unavailable attendees', async () => {
    mockedUseFreeBusy.mockReturnValue({
      loading: false,
      error: null,
      availabilities: [
        { email: 'external@example.com', slots: [], available: false, color: '#E53935' },
      ],
      suggestions: [{ start: new Date('2026-08-28T12:00:00Z'), end: new Date('2026-08-28T13:00:00Z') }],
      mergedBusy: [],
      searchStart,
      searchEnd,
      refetch: jest.fn(),
    });

    const { getByText } = render(
      <FindTimeSheet
        visible={true}
        onClose={jest.fn()}
        account={account}
        organizer={organizer}
        attendees={[{ email: 'external@example.com' }]}
        start={new Date('2026-08-28T10:00:00Z')}
        end={new Date('2026-08-28T11:00:00Z')}
        onApplySlot={jest.fn()}
      />,
    );

    await waitFor(() => expect(getByText('Unknown')).toBeTruthy());
  });

  it('renders mode buttons and required toggles in permissive mode', async () => {
    mockedUseFreeBusy.mockReturnValue({
      loading: false,
      error: null,
      availabilities: [
        { email: 'jane@example.com', displayName: 'Jane', slots: busySlots, available: true, color: '#E53935' },
      ],
      suggestions: [],
      mergedBusy: busySlots,
      searchStart,
      searchEnd,
      refetch: jest.fn(),
    });

    const { getByText, queryByText } = render(
      <FindTimeSheet
        visible={true}
        onClose={jest.fn()}
        account={account}
        organizer={organizer}
        attendees={attendees}
        start={new Date('2026-08-28T10:00:00Z')}
        end={new Date('2026-08-28T11:00:00Z')}
        onApplySlot={jest.fn()}
      />,
    );

    await waitFor(() => expect(getByText('All free')).toBeTruthy());
    expect(getByText('Some may be busy')).toBeTruthy();

    // Switch to permissive mode to reveal required toggle.
    const permissive = getByText('Some may be busy');
    permissive.props.onPress?.();
    await waitFor(() => expect(queryByText('Jane')).toBeTruthy());
  });
});
