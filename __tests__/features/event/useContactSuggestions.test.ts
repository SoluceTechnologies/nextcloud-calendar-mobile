import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useContactSuggestions } from '@/features/event/hooks/useContactSuggestions';
import { fetchSharees } from '@/services/nextcloud/sharees';
import type { Account } from '@/types';

jest.mock('@/services/nextcloud/sharees', () => ({
  fetchSharees: jest.fn(),
}));

const account: Account = {
  id: 'acc-1',
  displayName: 'Work',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'xxxx',
  davUserId: 'john',
};

const mockedFetchSharees = fetchSharees as jest.MockedFunction<typeof fetchSharees>;

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  mockedFetchSharees.mockReset();
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
});

interface HookProps { query: string }

it('debounces the sharees call and returns results', async () => {
  mockedFetchSharees.mockResolvedValue([
    { id: '1', displayName: 'John Doe', email: 'john@example.com', source: 'emails' },
  ]);

  const { result, rerender } = renderHook(
    ({ query }: HookProps) => useContactSuggestions({ account, query }),
    { initialProps: { query: 'jo' } },
  );

  expect(result.current.loading).toBe(true);

  act(() => { jest.advanceTimersByTime(300); });

  await waitFor(() => expect(result.current.suggestions).toHaveLength(1));

  expect(result.current.suggestions[0].email).toBe('john@example.com');
  expect(mockedFetchSharees).toHaveBeenCalledWith(expect.objectContaining({ query: 'jo' }));

  rerender({ query: 'joh' });

  act(() => { jest.advanceTimersByTime(300); });

  await waitFor(() => expect(mockedFetchSharees).toHaveBeenCalledTimes(2));
  expect(mockedFetchSharees).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'joh' }));
});

it('ignores stale results when the query changes faster than the debounce', async () => {
  mockedFetchSharees.mockImplementation(async ({ query }) => {
    if (query === 'old') {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return [{ id: 'old', displayName: 'Old', email: 'old@example.com', source: 'emails' }];
    }
    return [{ id: 'new', displayName: 'New', email: 'new@example.com', source: 'emails' }];
  });

  const { result, rerender } = renderHook(
    ({ query }: HookProps) => useContactSuggestions({ account, query }),
    { initialProps: { query: 'old' } },
  );

  act(() => { jest.advanceTimersByTime(300); });

  rerender({ query: 'new' });
  act(() => { jest.advanceTimersByTime(300); });

  await waitFor(() => expect(result.current.suggestions).toHaveLength(1));
  expect(result.current.suggestions[0].email).toBe('new@example.com');

  act(() => { jest.advanceTimersByTime(500); });

  expect(result.current.suggestions[0].email).toBe('new@example.com');
});
