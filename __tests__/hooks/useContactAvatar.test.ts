import { renderHook, waitFor } from '@testing-library/react-native';
import { useContactAvatar } from '@/features/event/hooks/useContactAvatar';
import { storage } from '@/storage';
import { utf8ToBase64 } from '@/services/shared/base64';
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

function imageResponse(body: string, contentType: string) {
  return {
    ok: true,
    status: 200,
    text: async () => body,
    headers: { forEach: (cb: (v: string, k: string) => void) => cb(contentType, 'content-type') },
  };
}

describe('useContactAvatar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.clearAll();
    (globalThis as any).fetch = jest.fn();
  });

  it('returns undefined and fetches nothing when the contact has no photo', () => {
    const { result } = renderHook(() => useContactAvatar(account, undefined));
    expect(result.current.data).toBeUndefined();
    expect((globalThis as any).fetch).not.toHaveBeenCalled();
  });

  it('returns undefined when there is no account', () => {
    const { result } = renderHook(() =>
      useContactAvatar(null, 'https://cloud.example.com/photo-1.png'),
    );
    expect(result.current.data).toBeUndefined();
    expect((globalThis as any).fetch).not.toHaveBeenCalled();
  });

  it('loads an instance-hosted photo as a base64 data URI', async () => {
    ((globalThis as any).fetch as jest.Mock).mockResolvedValue(imageResponse('PNGDATA', 'image/png'));

    const url = 'https://cloud.example.com/remote.php/photo-2.png';
    const { result } = renderHook(() => useContactAvatar(account, url));

    const expected = `data:image/png;base64,${utf8ToBase64('PNGDATA')}`;
    await waitFor(() => expect(result.current.data).toBe(expected));

    expect((globalThis as any).fetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) }),
      }),
    );
  });

  it('serves a cached photo without hitting the network', () => {
    const url = 'https://cloud.example.com/photo-3.png';
    storage.set(`avatar:contact:${account.id}:${url}`, 'data:image/png;base64,CACHED');

    const { result } = renderHook(() => useContactAvatar(account, url));

    expect(result.current.data).toBe('data:image/png;base64,CACHED');
    expect((globalThis as any).fetch).not.toHaveBeenCalled();
  });

  it('never sends credentials to a photo hosted outside the instance', async () => {
    const { result } = renderHook(() =>
      useContactAvatar(account, 'https://cloud.example.com.evil.test/photo-4.png'),
    );

    await waitFor(() => expect(result.current.data).toBeNull());
    expect((globalThis as any).fetch).not.toHaveBeenCalled();
  });

  it('falls back to no photo when the instance answers non-ok', async () => {
    ((globalThis as any).fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404 });

    const { result } = renderHook(() =>
      useContactAvatar(account, 'https://cloud.example.com/photo-5.png'),
    );

    await waitFor(() => expect(result.current.data).toBeNull());
  });
});
