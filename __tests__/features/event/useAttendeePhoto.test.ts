import { renderHook, waitFor } from '@testing-library/react-native';
import { useAttendeePhoto, __clearAttendeePhotoCache } from '@/features/event/hooks/useAttendeePhoto';
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
  __clearAttendeePhotoCache();
  mockedFetchSharees.mockReset();
});

describe('useAttendeePhoto', () => {
  it('resolves the photoUrl of the exact email match', async () => {
    mockedFetchSharees.mockResolvedValue([
      { id: '1', displayName: 'Alice A', email: 'alice2@example.com', source: 'user', photoUrl: 'https://cloud.example.com/avatar/alice2' },
      { id: '2', displayName: 'Alice', email: 'alice@example.com', source: 'user', photoUrl: 'https://cloud.example.com/avatar/alice' },
    ]);
    const { result } = renderHook(() => useAttendeePhoto(account, 'alice@example.com'));
    await waitFor(() => expect(result.current.photoUrl).toBe('https://cloud.example.com/avatar/alice'));
    expect(mockedFetchSharees).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'alice@example.com', limit: 10 }),
    );
  });

  it('returns undefined photoUrl when the attendee is unknown', async () => {
    mockedFetchSharees.mockResolvedValue([]);
    const { result } = renderHook(() => useAttendeePhoto(account, 'ghost@example.com'));
    await waitFor(() => expect(result.current.resolving).toBe(false));
    expect(result.current.photoUrl).toBeUndefined();
  });

  it('returns undefined photoUrl when the match has no photo', async () => {
    mockedFetchSharees.mockResolvedValue([
      { id: '1', displayName: 'Bob', email: 'bob@example.com', source: 'user' },
    ]);
    const { result } = renderHook(() => useAttendeePhoto(account, 'bob@example.com'));
    await waitFor(() => expect(result.current.resolving).toBe(false));
    expect(result.current.photoUrl).toBeUndefined();
  });

  it('swallows fetch errors and falls back to initials', async () => {
    mockedFetchSharees.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useAttendeePhoto(account, 'nobody@example.com'));
    await waitFor(() => expect(result.current.resolving).toBe(false));
    expect(result.current.photoUrl).toBeUndefined();
  });

  it('caches per account and email — a second hook does not refetch', async () => {
    mockedFetchSharees.mockResolvedValue([
      { id: '1', displayName: 'Alice', email: 'alice@example.com', source: 'user', photoUrl: 'https://cloud.example.com/a' },
    ]);
    const first = renderHook(() => useAttendeePhoto(account, 'alice@example.com'));
    await waitFor(() => expect(first.result.current.photoUrl).toBe('https://cloud.example.com/a'));
    expect(mockedFetchSharees).toHaveBeenCalledTimes(1);

    const second = renderHook(() => useAttendeePhoto(account, 'alice@example.com'));
    expect(second.result.current.photoUrl).toBe('https://cloud.example.com/a');
    expect(mockedFetchSharees).toHaveBeenCalledTimes(1);
  });

  it('does not fetch without account or email', () => {
    renderHook(() => useAttendeePhoto(null, 'alice@example.com'));
    renderHook(() => useAttendeePhoto(account, undefined));
    expect(mockedFetchSharees).not.toHaveBeenCalled();
  });
});
