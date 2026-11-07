import { act, renderHook } from '@testing-library/react-native';

import { useActiveAccount } from '@/hooks/useAccounts';
import { searchCalendarEvents } from '@/services/nextcloud/search';
import { useIsOnline } from '@/services/shared/network';
import { useRemoteSearch } from '@/features/search/useRemoteSearch';
import type { ServerRequest } from '@/features/search/serverSearch';

jest.mock('@/services/nextcloud/search', () => ({ searchCalendarEvents: jest.fn() }));
jest.mock('@/hooks/useAccounts', () => ({ useActiveAccount: jest.fn() }));
jest.mock('@/services/shared/network', () => ({ useIsOnline: jest.fn(() => true) }));

jest.useFakeTimers();

const firstAccount: any = { id: 'a1', baseUrl: 'https://one.example.com', username: 'john', appPassword: 'secret' };
const secondAccount: any = { id: 'a2', baseUrl: 'https://two.example.com', username: 'jane', appPassword: 'secret' };
const entry = (title: string) => ({ title, subline: '', resourceUrl: '', start: null });
const lunch: ServerRequest = { term: 'lunch' };
const search = searchCalendarEvents as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  (useActiveAccount as jest.Mock).mockImplementation((id: string | null) =>
    id === 'a1' ? firstAccount : id === 'a2' ? secondAccount : null,
  );
  (useIsOnline as jest.Mock).mockReturnValue(true);
});

it('does not call the server before the debounce elapses', () => {
  renderHook(() => useRemoteSearch('a1', lunch));
  jest.advanceTimersByTime(299);
  expect(search).not.toHaveBeenCalled();
});

it('calls the server once with the request after 300 ms', async () => {
  search.mockResolvedValue([entry('Lunch')]);
  const request: ServerRequest = { term: 'lunch', since: '2026-11-02T00:00:00.000Z' };
  const { result } = renderHook(() => useRemoteSearch('a1', request));
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(search).toHaveBeenCalledTimes(1);
  expect(search.mock.calls[0]).toEqual([firstAccount, request]);
  expect(result.current.entries).toEqual([entry('Lunch')]);
});

it('does not call the server offline or without a request', async () => {
  (useIsOnline as jest.Mock).mockReturnValueOnce(false);
  renderHook(() => useRemoteSearch('a1', lunch));
  renderHook(() => useRemoteSearch('a1', null));
  renderHook(() => useRemoteSearch(null, lunch));
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(search).not.toHaveBeenCalled();
});

it('does not resend an equal request built again on rerender', async () => {
  search.mockResolvedValue([]);
  const { rerender } = renderHook(({ term }: { term: string }) => useRemoteSearch('a1', { term }), {
    initialProps: { term: 'lunch' },
  });
  await act(async () => { jest.advanceTimersByTime(300); });
  rerender({ term: 'lunch' });
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(search).toHaveBeenCalledTimes(1);
});

it('ignores a response for a request that has since changed', async () => {
  let resolveFirst!: (value: unknown) => void;
  search.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
  search.mockResolvedValueOnce([entry('Second')]);
  const { result, rerender } = renderHook(({ term }: { term: string }) => useRemoteSearch('a1', { term }), {
    initialProps: { term: 'lu' },
  });
  await act(async () => { jest.advanceTimersByTime(300); });
  rerender({ term: 'lunch' });
  await act(async () => { jest.advanceTimersByTime(300); });
  await act(async () => { resolveFirst([entry('First')]); });
  expect(result.current.entries).toEqual([entry('Second')]);
});

it('ignores the old account response and queries the new account after a switch', async () => {
  let resolveFirst!: (value: unknown) => void;
  search.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
  search.mockResolvedValueOnce([entry('From second account')]);
  const { result, rerender } = renderHook(({ accountId }: { accountId: string }) => useRemoteSearch(accountId, lunch), {
    initialProps: { accountId: 'a1' },
  });
  await act(async () => { jest.advanceTimersByTime(300); });
  rerender({ accountId: 'a2' });
  await act(async () => { jest.advanceTimersByTime(300); });
  await act(async () => { resolveFirst([entry('From first account')]); });
  expect(search.mock.calls[1][0]).toBe(secondAccount);
  expect(result.current.entries).toEqual([entry('From second account')]);
});

it('reports a failure instead of throwing', async () => {
  search.mockRejectedValue(new Error('boom'));
  const { result } = renderHook(() => useRemoteSearch('a1', lunch));
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(result.current.failed).toBe(true);
});

it('resets loading when an in-flight request is abandoned', async () => {
  let resolvePending!: (value: unknown) => void;
  search.mockImplementationOnce(() => new Promise((resolve) => { resolvePending = resolve; }));
  const { result, rerender } = renderHook(
    ({ request }: { request: ServerRequest | null }) => useRemoteSearch('a1', request),
    { initialProps: { request: lunch as ServerRequest | null } },
  );
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(result.current.loading).toBe(true);
  rerender({ request: null });
  await act(async () => { resolvePending([]); });
  expect(result.current.loading).toBe(false);
});

it('re-dispatches once the device comes back online', async () => {
  (useIsOnline as jest.Mock).mockReturnValue(false);
  search.mockResolvedValue([]);
  const { rerender } = renderHook(() => useRemoteSearch('a1', lunch));
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(search).not.toHaveBeenCalled();

  (useIsOnline as jest.Mock).mockReturnValue(true);
  rerender(undefined);
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(search).toHaveBeenCalledTimes(1);
});
