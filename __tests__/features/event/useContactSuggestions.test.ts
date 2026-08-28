import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useContactSuggestions } from '@/features/event/hooks/useContactSuggestions';
import { fetchSharees, fetchAllContacts } from '@/services/nextcloud/sharees';
import { storage } from '@/storage';
import type { Account } from '@/types';

jest.mock('@/services/nextcloud/sharees', () => ({
  fetchSharees: jest.fn(),
  fetchAllContacts: jest.fn(),
}));

const account: Account = {
  id: 'acc-1',
  displayName: 'Work',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'xxxx',
  davUserId: 'john',
};

const john = { id: '1', displayName: 'John Doe', email: 'john@example.com', source: 'user' as const };
const jane = { id: '2', displayName: 'Jane Doe', email: 'jane@example.com', source: 'user' as const };

const mockedFetchSharees = fetchSharees as jest.MockedFunction<typeof fetchSharees>;
const mockedFetchAllContacts = fetchAllContacts as jest.MockedFunction<typeof fetchAllContacts>;

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  storage.clearAll();
  mockedFetchSharees.mockReset();
  mockedFetchAllContacts.mockReset();
  // By default the background prefetch returns a realistic full contact list.
  mockedFetchAllContacts.mockResolvedValue([john, jane]);
});

afterEach(() => {
  jest.useRealTimers();
});

it('returns empty suggestions when no account is provided', () => {
  const { result } = renderHook(() => useContactSuggestions({ account: null, query: 'jo' }));
  expect(result.current.suggestions).toEqual([]);
  expect(result.current.loading).toBe(false);
});

it('returns empty suggestions for short queries', () => {
  const { result } = renderHook(() => useContactSuggestions({ account, query: 'j' }));
  expect(result.current.suggestions).toEqual([]);
  expect(result.current.loading).toBe(false);
  expect(mockedFetchSharees).not.toHaveBeenCalled();
  expect(mockedFetchAllContacts).not.toHaveBeenCalled();
});

interface HookProps { query: string }

it('queries the server and primes the cache for the next search', async () => {
  mockedFetchSharees.mockResolvedValue([john]);

  const { result, rerender } = renderHook(
    ({ query }: HookProps) => useContactSuggestions({ account, query }),
    { initialProps: { query: 'jo' } },
  );

  expect(result.current.loading).toBe(true);

  act(() => { jest.advanceTimersByTime(150); });

  await waitFor(() => expect(result.current.suggestions).toHaveLength(1));
  expect(result.current.suggestions[0].email).toBe('john@example.com');
  expect(result.current.loading).toBe(false);

  expect(mockedFetchSharees).toHaveBeenCalledTimes(1);
  expect(mockedFetchAllContacts).toHaveBeenCalledTimes(1);

  rerender({ query: 'joh' });

  // Cache is fresh: no extra network call is made.
  await waitFor(() => expect(result.current.suggestions).toHaveLength(1));
  expect(result.current.suggestions[0].email).toBe('john@example.com');
  expect(mockedFetchSharees).toHaveBeenCalledTimes(1);
  expect(mockedFetchAllContacts).toHaveBeenCalledTimes(1);
});

it('shows cached results immediately and refreshes stale cache in the background', async () => {
  // Pre-fill the cache as if a background fetch happened earlier.
  storage.set('contacts:acc-1', JSON.stringify([john, jane]));
  // Mark it stale so the hook refreshes in the background.
  const oneHourAgo = Date.now() - 61 * 60 * 1000;
  storage.set('contacts:acc-1:at', oneHourAgo.toString());

  const { result } = renderHook(() => useContactSuggestions({ account, query: 'ja' }));

  // Cache is shown immediately while background refresh runs.
  await waitFor(() => expect(result.current.suggestions).toEqual([jane]));

  act(() => { jest.advanceTimersByTime(150); });
  await waitFor(() => expect(mockedFetchAllContacts).toHaveBeenCalledTimes(1));

  expect(result.current.suggestions).toEqual([jane]);
});

it('falls back to cache on network error', async () => {
  mockedFetchAllContacts.mockRejectedValue(new Error('Network error'));

  storage.set('contacts:acc-1', JSON.stringify([john]));
  // stale so it tries to refresh
  storage.set('contacts:acc-1:at', (Date.now() - 61 * 60 * 1000).toString());

  const { result } = renderHook(() => useContactSuggestions({ account, query: 'jo' }));

  await waitFor(() => expect(result.current.suggestions).toEqual([john]));

  act(() => { jest.advanceTimersByTime(150); });

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBeInstanceOf(Error);
  expect(result.current.suggestions).toEqual([john]);
});

it('ignores stale results when the query changes faster than the debounce', async () => {
  const oldContact = { id: 'old', displayName: 'Old', email: 'old@example.com', source: 'user' as const };
  const newContact = { id: 'new', displayName: 'New', email: 'new@example.com', source: 'user' as const };
  mockedFetchSharees.mockImplementation(async ({ query }) => {
    if (query === 'old') {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return [oldContact];
    }
    return [newContact];
  });
  mockedFetchAllContacts.mockResolvedValue([oldContact, newContact]);

  const { result, rerender } = renderHook(
    ({ query }: HookProps) => useContactSuggestions({ account, query }),
    { initialProps: { query: 'old' } },
  );

  act(() => { jest.advanceTimersByTime(150); });

  rerender({ query: 'new' });

  // The cache already contains the matching contact, so the result is
  // available before the stale "old" request completes.
  await waitFor(() => expect(result.current.suggestions).toHaveLength(1));
  expect(result.current.suggestions[0].email).toBe('new@example.com');

  act(() => { jest.advanceTimersByTime(500); });

  expect(result.current.suggestions[0].email).toBe('new@example.com');
});
