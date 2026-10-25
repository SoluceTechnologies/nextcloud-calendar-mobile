import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { ThemeProvider } from 'expo-router';

dayjs.extend(localizedFormat);
import { lightTheme } from '../../src/theme';
import FindTimeScreen from '../../app/event/find-time';
import { useFreeBusy } from '@/features/event/hooks/useFreeBusy';
import { useFindTimeStore } from '@/features/event/stores/findTimeStore';
import i18n from '../../src/utils/i18n';
import type { Account, Attendee, BusySlot } from '@/types';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn() }),
}));

jest.mock('@/features/event/hooks/useFreeBusy', () => ({
  useFreeBusy: jest.fn(),
}));

const mockedUseFreeBusy = useFreeBusy as jest.MockedFunction<typeof useFreeBusy>;

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ThemeProvider, { value: lightTheme, children });
}

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

// Use a fixed "today" so day-of-week labels stay deterministic.
const eventStart = new Date();
eventStart.setHours(14, 0, 0, 0);
const eventEnd = new Date(eventStart.getTime() + 30 * 60_000);

const searchStart = new Date(eventStart);
searchStart.setDate(searchStart.getDate() - 7);
searchStart.setHours(0, 0, 0, 0);
const searchEnd = new Date(searchStart);
searchEnd.setDate(searchEnd.getDate() + 15);

const busySlots: BusySlot[] = [
  {
    start: new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate(), 10, 0),
    end: new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate(), 10, 30),
    fbType: 'BUSY',
  },
];

function seedRequest() {
  useFindTimeStore.getState().setRequest({
    account,
    organizer,
    attendees,
    start: eventStart,
    end: eventEnd,
    eventTitle: 'Planning',
    mode: 'strict',
    requiredAttendees: attendees.map((a) => a.email.toLowerCase()),
  });
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  jest.clearAllMocks();
  useFindTimeStore.getState().reset();
});

describe('FindTimeScreen', () => {
  it('shows an empty state when no request was stored', () => {
    const { getByText } = render(<FindTimeScreen />, { wrapper });
    expect(getByText('Open this view from the event form.')).toBeTruthy();
  });

  it('renders the merged lane, attendee lanes and the day strip', async () => {
    seedRequest();
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

    const { getByText, getByTestId, getAllByTestId } = render(<FindTimeScreen />, { wrapper });

    await waitFor(() => expect(getByText('Everyone')).toBeTruthy());
    expect(getByText('Jane')).toBeTruthy();
    expect(getByTestId('lane-merged')).toBeTruthy();
    expect(getByTestId('lane-0')).toBeTruthy();
    // 15-day window → 15 day chips
    expect(getAllByTestId(/^day-strip-/).length).toBe(15);
    // Current event position is selected and free → Apply enabled
    expect(getByTestId('find-time-apply')).toBeTruthy();
  });

  it('places the event where the merged lane is tapped', async () => {
    seedRequest();
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

    const { getByTestId } = render(<FindTimeScreen />, { wrapper });
    await waitFor(() => expect(getByTestId('lane-merged')).toBeTruthy());

    // Working-hours mode is on by default; Jane has no BUSY-UNAVAILABLE
    // slots → fallback range 06:00–22:00. pxPerMinute = 1 → tap at x=600
    // → 06:00 + 600 min = 16:00.
    fireEvent.press(getByTestId('lane-merged'), { nativeEvent: { locationX: 600 } });

    const expectedStart = new Date(eventStart);
    expectedStart.setHours(16, 0, 0, 0);
    const expectedLabel = dayjs(expectedStart).format('LT');

    await waitFor(() => {
      const selection = getByTestId('find-time-selection');
      const text = (selection.props.children as (string | undefined)[]).join('');
      expect(text).toContain(expectedLabel);
    });
  });

  it('shows the full 24h range when the working-hours toggle is off', async () => {
    seedRequest();
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

    const { getByTestId } = render(<FindTimeScreen />, { wrapper });
    await waitFor(() => expect(getByTestId('find-time-working-hours')).toBeTruthy());

    fireEvent(getByTestId('find-time-working-hours'), 'onValueChange', false);

    // 24h range → tap at x=960 → 16:00
    fireEvent.press(getByTestId('lane-merged'), { nativeEvent: { locationX: 960 } });

    const expectedStart = new Date(eventStart);
    expectedStart.setHours(16, 0, 0, 0);
    const expectedLabel = dayjs(expectedStart).format('LT');

    await waitFor(() => {
      const selection = getByTestId('find-time-selection');
      const text = (selection.props.children as (string | undefined)[]).join('');
      expect(text).toContain(expectedLabel);
    });
  });

  it('applies the draft slot through the store and goes back', async () => {
    seedRequest();
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

    const { getByTestId } = render(<FindTimeScreen />, { wrapper });
    await waitFor(() => expect(getByTestId('find-time-apply')).toBeTruthy());

    fireEvent.press(getByTestId('find-time-apply'));

    const { result } = useFindTimeStore.getState();
    expect(result).toEqual({ start: eventStart, end: eventEnd });
    expect(mockBack).toHaveBeenCalled();
  });
});
