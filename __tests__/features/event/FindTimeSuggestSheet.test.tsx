import type { ReactElement } from 'react';
import { render as rtlRender, waitFor, fireEvent } from '@testing-library/react-native';
import { ThemeWrapper } from '../../helpers/theme';

const render = (ui: ReactElement, opts?: Parameters<typeof rtlRender>[1]) =>
  rtlRender(ui, { wrapper: ThemeWrapper, ...opts });

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

import { FindTimeSuggestSheet } from '@/features/event/components/FindTimeSuggestSheet';
import { useFreeBusy } from '@/features/event/hooks/useFreeBusy';
import { useFindTimeStore } from '@/features/event/stores/findTimeStore';
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
const searchEnd = new Date('2026-09-12T00:00:00Z');
const busySlots: BusySlot[] = [
  { start: new Date('2026-08-28T10:00:00Z'), end: new Date('2026-08-28T10:30:00Z'), fbType: 'BUSY' },
];

function mockResult(overrides: Partial<ReturnType<typeof useFreeBusy>> = {}) {
  mockedUseFreeBusy.mockReturnValue({
    loading: false,
    error: null,
    availabilities: [
      { email: 'jane@example.com', displayName: 'Jane', slots: busySlots, available: true, color: '#E53935' },
    ],
    suggestions: [{ start: new Date('2099-08-28T12:00:00Z'), end: new Date('2099-08-28T13:00:00Z') }],
    mergedBusy: busySlots,
    searchStart,
    searchEnd,
    refetch: jest.fn(),
    ...overrides,
  });
}

function renderSheet(props: Partial<Parameters<typeof FindTimeSuggestSheet>[0]> = {}) {
  return render(
    <FindTimeSuggestSheet
      visible={true}
      onClose={jest.fn()}
      account={account}
      organizer={organizer}
      attendees={attendees}
      start={new Date('2099-08-28T10:00:00Z')}
      end={new Date('2099-08-28T11:00:00Z')}
      onApplySlot={jest.fn()}
      {...props}
    />,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  jest.clearAllMocks();
  useFindTimeStore.getState().reset();
});

describe('FindTimeSuggestSheet', () => {
  it('shows loading spinner when loading', async () => {
    mockResult({ loading: true, availabilities: [], suggestions: [], mergedBusy: [], searchStart: null, searchEnd: null });
    const { getByText } = renderSheet();
    await waitFor(() => expect(getByText('Checking availability…')).toBeTruthy());
  });

  it('shows error message and retry button on error', async () => {
    const refetch = jest.fn();
    mockResult({ error: new Error('Server error'), availabilities: [], suggestions: [], mergedBusy: [], searchStart: null, searchEnd: null, refetch });
    const { getByText } = renderSheet();
    await waitFor(() => expect(getByText('Could not fetch availability. The server may have free/busy disabled.')).toBeTruthy());
    fireEvent.press(getByText('Retry'));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows no-slots message when there is nothing to suggest', async () => {
    mockResult({ availabilities: [], suggestions: [], mergedBusy: [], searchStart: null, searchEnd: null });
    const { getByText } = renderSheet();
    await waitFor(() => expect(getByText('No free slots found in the 15-day window.')).toBeTruthy());
  });

  it('lists suggestions and applies the tapped slot', async () => {
    const onApplySlot = jest.fn();
    const onClose = jest.fn();
    mockResult();
    const { getByTestId, getAllByText } = renderSheet({ onApplySlot, onClose });

    await waitFor(() => expect(getByTestId('suggestion-0')).toBeTruthy());
    expect(getAllByText('Everyone free').length).toBeGreaterThan(0);

    fireEvent.press(getByTestId('suggestion-0'));
    expect(onApplySlot).toHaveBeenCalledWith({
      start: new Date('2099-08-28T12:00:00Z'),
      end: new Date('2099-08-28T13:00:00Z'),
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('labels suggestions overlapping an attendee busy slot', async () => {
    mockResult({
      suggestions: [
        { start: new Date('2099-08-28T10:00:00Z'), end: new Date('2099-08-28T10:30:00Z') },
      ],
      availabilities: [
        {
          email: 'jane@example.com',
          displayName: 'Jane',
          slots: [
            { start: new Date('2099-08-28T10:00:00Z'), end: new Date('2099-08-28T10:30:00Z'), fbType: 'BUSY' },
          ],
          available: true,
          color: '#E53935',
        },
      ],
    });
    const { getByText } = renderSheet();
    await waitFor(() => expect(getByText('Jane busy')).toBeTruthy());
  });

  it('stores the request, closes and navigates on Explore timeline', async () => {
    const onClose = jest.fn();
    mockResult();
    const { getByTestId } = renderSheet({ onClose });

    await waitFor(() => expect(getByTestId('find-time-explore')).toBeTruthy());
    fireEvent.press(getByTestId('find-time-explore'));

    const { request } = useFindTimeStore.getState();
    expect(request).not.toBeNull();
    expect(request!.attendees).toEqual(attendees);
    expect(request!.mode).toBe('strict');
    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/event/find-time');
  });

  it('marks the suggestion matching the current event time as Current', async () => {
    mockResult();
    const { getByText } = renderSheet({
      start: new Date('2099-08-28T12:00:00Z'),
      end: new Date('2099-08-28T13:00:00Z'),
    });
    await waitFor(() => expect(getByText(/Current/)).toBeTruthy());
  });
});
