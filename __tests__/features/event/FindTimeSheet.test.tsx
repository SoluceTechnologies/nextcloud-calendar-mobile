import type { ReactElement } from 'react';
import { render as rtlRender, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeWrapper } from '../../helpers/theme';

const render = (ui: ReactElement, opts?: Parameters<typeof rtlRender>[1]) =>
  rtlRender(ui, { wrapper: ThemeWrapper, ...opts });

import { FindTimeSheet } from '@/features/event/components/FindTimeSheet';
import { useFreeBusy } from '@/features/event/hooks/useFreeBusy';
import i18n from '@/utils/i18n';
import type { Account, Attendee, SuggestedSlot } from '@/types';

jest.mock('@/features/event/hooks/useFreeBusy', () => ({
  useFreeBusy: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
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

  it('shows no slots message when suggestions are empty', async () => {
    mockedUseFreeBusy.mockReturnValue({
      loading: false,
      error: null,
      availabilities: [],
      suggestions: [],
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

    await waitFor(() => expect(getByText('No free slots found in the next 7 days.')).toBeTruthy());
  });

  it('renders suggested slots and attendee availability', async () => {
    const slot: SuggestedSlot = { start: new Date('2026-08-28T12:00:00Z'), end: new Date('2026-08-28T13:00:00Z') };
    mockedUseFreeBusy.mockReturnValue({
      loading: false,
      error: null,
      availabilities: [
        { email: 'jane@example.com', displayName: 'Jane', slots: [], available: true },
      ],
      suggestions: [slot],
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

    await waitFor(() => expect(getByText('Suggested slots')).toBeTruthy());
    expect(getByText('Jane')).toBeTruthy();
    expect(getByText('Available')).toBeTruthy();
  });

  it('shows Unknown for unavailable attendees', async () => {
    mockedUseFreeBusy.mockReturnValue({
      loading: false,
      error: null,
      availabilities: [
        { email: 'external@example.com', slots: [], available: false },
      ],
      suggestions: [{ start: new Date('2026-08-28T12:00Z'), end: new Date('2026-08-28T13:00Z') }],
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
});
