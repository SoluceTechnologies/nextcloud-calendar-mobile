import { renderHook, waitFor } from '@testing-library/react-native';

import { useCalendarData } from '@/features/calendar/hooks/useCalendarData';
import { syncVisibleRange } from '@/database/sync';
import { useEventsForRange } from '@/database/useEvents';
import { useCalendars } from '@/hooks/useCalendars';
import { setAccounts } from '@/hooks/useAccounts';
import { useAccountStore } from '@/stores/accountStore';
import type { Account, CalendarMeta } from '@/types';

jest.mock('@/database/sync', () => ({ syncVisibleRange: jest.fn() }));
jest.mock('@/database/useEvents', () => ({ useEventsForRange: jest.fn(() => []) }));
jest.mock('@/hooks/useCalendars', () => ({ useCalendars: jest.fn() }));

const account = {
  id: 'a1',
  displayName: 'Test',
  baseUrl: 'https://cloud.example.com',
  username: 'u',
  appPassword: 'p',
  davUserId: 'u',
} as Account;

const cal = {
  id: 'https://cloud.example.com/remote.php/dav/calendars/u/personal/',
  accountId: 'a1',
  displayName: 'Personal',
  color: '#0082c9',
  ctag: '1',
  url: 'https://cloud.example.com/remote.php/dav/calendars/u/personal/',
  slug: 'personal',
} as CalendarMeta;

function deferred<T = void>() {
  let resolve!: (v: T | PromiseLike<T>) => void;
  let reject!: (e?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function mockCalendars(list: CalendarMeta[]) {
  (useCalendars as jest.Mock).mockReturnValue({ data: list, isFetching: false });
}

beforeEach(() => {
  jest.clearAllMocks();
  (useEventsForRange as jest.Mock).mockReturnValue([]);
  setAccounts([account]);
  useAccountStore.getState().setActiveAccountId(account.id);
  mockCalendars([cal]);
});

describe('useCalendarData loading overlay', () => {
  it('shows the full overlay while the first sync runs', async () => {
    (syncVisibleRange as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCalendarData(new Date()));
    await waitFor(() => expect(result.current.showFullOverlay).toBe(true));
  });

  it('does not leave the overlay stuck when calendars empty out mid-sync (#358)', async () => {
    const run = deferred();
    (syncVisibleRange as jest.Mock).mockReturnValue(run.promise);

    const { result, rerender } = renderHook(() => useCalendarData(new Date()));
    await waitFor(() => expect(result.current.showFullOverlay).toBe(true));

    // The calendars list re-emits empty while the sync is still in flight:
    // cleanup marks the old run inactive, the new run early-returns.
    mockCalendars([]);
    rerender({});

    run.resolve();
    await waitFor(() => expect(result.current.showFullOverlay).toBe(false));
  });

  it('does not leave the overlay stuck on a stale-account emission mid-sync', async () => {
    const run = deferred();
    (syncVisibleRange as jest.Mock).mockReturnValue(run.promise);

    const { result, rerender } = renderHook(() => useCalendarData(new Date()));
    await waitFor(() => expect(result.current.showFullOverlay).toBe(true));

    // Transient emission of another account's calendars during account switch.
    mockCalendars([{ ...cal, id: 'other-cal', accountId: 'other-account' }]);
    rerender({});

    run.resolve();
    await waitFor(() => expect(result.current.showFullOverlay).toBe(false));
  });

  it('keeps the overlay until the latest overlapping sync settles', async () => {
    const runA = deferred();
    const runB = deferred();
    (syncVisibleRange as jest.Mock)
      .mockReturnValueOnce(runA.promise)
      .mockReturnValueOnce(runB.promise);

    const { result, rerender } = renderHook(() => useCalendarData(new Date()));
    await waitFor(() => expect(result.current.showFullOverlay).toBe(true));

    mockCalendars([{ ...cal, ctag: '2' }]);
    rerender({});
    await waitFor(() => expect(syncVisibleRange).toHaveBeenCalledTimes(2));

    runA.resolve();
    // Older run settles while run B is still in flight.
    await waitFor(() => expect(result.current.showFullOverlay).toBe(true));
    runB.resolve();
    await waitFor(() => expect(result.current.showFullOverlay).toBe(false));
  });

  it('hides the overlay when the sync fails', async () => {
    (syncVisibleRange as jest.Mock).mockRejectedValue(new Error('HTTP 500'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useCalendarData(new Date()));
    await waitFor(() => expect(result.current.showFullOverlay).toBe(false));

    warn.mockRestore();
  });

  it('never shows the overlay when no calendars were discovered', () => {
    mockCalendars([]);
    const { result } = renderHook(() => useCalendarData(new Date()));
    expect(result.current.showFullOverlay).toBe(false);
    expect(syncVisibleRange).not.toHaveBeenCalled();
  });
});
