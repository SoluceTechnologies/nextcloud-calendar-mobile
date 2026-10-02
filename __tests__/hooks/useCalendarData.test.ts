import { renderHook, act } from '@testing-library/react-native';
import { useCalendarData } from '../../src/features/calendar/hooks/useCalendarData';
import { syncVisibleRange } from '@/database/sync';
import { useIsOnline } from '@/services/shared/network';
import { useAccountStore } from '@/stores/accountStore';
import { useCalendarStore } from '@/stores/calendarStore';

const mockAccount = { id: 'acc-1' };
const mockCalendars = [{ id: 'cal-1', accountId: 'acc-1' }];

jest.mock('@/database/sync', () => ({
  syncVisibleRange: jest.fn(),
}));
jest.mock('@/database/useEvents', () => ({
  useEventsForRange: jest.fn(() => []),
}));
jest.mock('@/hooks/useCalendars', () => ({
  useCalendars: jest.fn(() => ({ data: mockCalendars, isFetching: false })),
}));
jest.mock('@/hooks/useAccounts', () => ({
  useActiveAccount: jest.fn(() => mockAccount),
}));
jest.mock('@/services/shared/network', () => ({
  useIsOnline: jest.fn(() => true),
}));
jest.mock('@/utils/normalizeEvent', () => ({
  normalizeEvents: jest.fn((events) => events),
}));

const mockSync = syncVisibleRange as jest.Mock;
const mockOnline = useIsOnline as jest.Mock;

async function flush() {
  await act(async () => {});
}

describe('useCalendarData', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockSync.mockReset();
    mockSync.mockResolvedValue({ failedCount: 0 });
    mockOnline.mockReturnValue(true);
    useAccountStore.setState({ activeAccountId: 'acc-1' });
    useCalendarStore.setState({ hiddenCalendarIds: [] });
  });
  afterEach(() => { jest.useRealTimers(); });

  it('syncs the window on mount and reports no failure', async () => {
    const { result } = renderHook(() => useCalendarData(new Date('2026-09-15')));
    await flush();

    expect(mockSync).toHaveBeenCalledWith(mockAccount, mockCalendars, expect.any(Date), expect.any(Date));
    expect(result.current.syncFailed).toBe(false);
  });

  it('flags a total failure and retries after the first backoff delay', async () => {
    mockSync.mockReset();
    mockSync
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue({ failedCount: 0 });

    const { result } = renderHook(() => useCalendarData(new Date('2026-09-15')));
    await flush();
    expect(result.current.syncFailed).toBe(true);

    const callsBefore = mockSync.mock.calls.length;
    await act(async () => { jest.advanceTimersByTime(15000); });
    await flush();

    expect(mockSync.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(result.current.syncFailed).toBe(false);
  });

  it('flags a partial failure and clears it when the retry succeeds', async () => {
    mockSync.mockReset();
    mockSync
      .mockResolvedValueOnce({ failedCount: 1 })
      .mockResolvedValue({ failedCount: 0 });

    const { result } = renderHook(() => useCalendarData(new Date('2026-09-15')));
    await flush();
    expect(result.current.syncFailed).toBe(true);

    await act(async () => { jest.advanceTimersByTime(15000); });
    await flush();
    expect(result.current.syncFailed).toBe(false);
  });

  it('re-syncs when connectivity comes back', async () => {
    const { rerender } = renderHook(() => useCalendarData(new Date('2026-09-15')));
    await flush();
    const callsBefore = mockSync.mock.calls.length;

    mockOnline.mockReturnValue(false);
    rerender({});
    await flush();
    expect(mockSync.mock.calls.length).toBe(callsBefore);

    mockOnline.mockReturnValue(true);
    rerender({});
    await flush();
    expect(mockSync.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('retrySync triggers an immediate refetch and resets the backoff', async () => {
    mockSync.mockReset();
    mockSync.mockRejectedValue(new Error('still failing'));

    const { result } = renderHook(() => useCalendarData(new Date('2026-09-15')));
    await flush();
    const callsBefore = mockSync.mock.calls.length;

    act(() => { result.current.retrySync(); });
    await flush();
    expect(mockSync.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
