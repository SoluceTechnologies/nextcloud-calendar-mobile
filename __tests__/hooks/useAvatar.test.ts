import { renderHook, waitFor } from '@testing-library/react-native';
import { useAvatar } from '@/features/account/hooks/useAvatar';
import { storage } from '@/storage';
import type { Account } from '../../src/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const account: Account = {
  id: 'acc-1',
  displayName: 'John Doe',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'secret',
  davUserId: 'john',
};

const DATA_URI = 'data:image/png;base64,abc123';

function mockFileReaderSuccess(dataUri: string) {
  (globalThis as any).FileReader = jest.fn().mockImplementation(() => ({
    readAsDataURL(this: Partial<FileReader>) {
      // @ts-ignore
      this.onload?.({ target: { result: dataUri } });
    },
    onload: null,
    onerror: null,
    result: dataUri,
  }));
}

describe('useAvatar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.clearAll();
    (globalThis as any).fetch = jest.fn();
  });

  it('returns undefined when account is null', () => {
    const { result } = renderHook(() => useAvatar(null));
    expect(result.current.data).toBeUndefined();
    expect((globalThis as any).fetch).not.toHaveBeenCalled();
  });

  it('returns a base64 data URI on a successful fetch', async () => {
    ((globalThis as any).fetch as jest.Mock).mockResolvedValue({
      ok: true,
      blob: jest.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' })),
    });
    mockFileReaderSuccess(DATA_URI);

    const { result } = renderHook(() => useAvatar(account));
    await waitFor(() => expect(result.current.data).toBe(DATA_URI));

    expect((globalThis as any).fetch).toHaveBeenCalledWith(
      'https://cloud.example.com/index.php/avatar/john/96',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) }),
      }),
    );
  });

  it('returns null on a non-ok response', async () => {
    ((globalThis as any).fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404 });
    const { result } = renderHook(() => useAvatar(account));
    await waitFor(() => expect(result.current.data).toBeNull());
  });

  it('returns null on a network error', async () => {
    ((globalThis as any).fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useAvatar(account));
    await waitFor(() => expect(result.current.data).toBeNull());
  });
});
