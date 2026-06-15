import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAvatar } from '../../src/hooks/useAvatar';
import type { Account } from '../../src/types';

const account: Account = {
  id: 'acc-1',
  displayName: 'John Doe',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'secret',
  davUserId: 'john',
};

const DATA_URI = 'data:image/png;base64,abc123';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client }, children);
}

function mockFileReaderSuccess(dataUri: string) {
  const mockReadAsDataURL = jest.fn(function (this: Partial<FileReader>) {
    if (this.onload) {
      // @ts-ignore
      this.onload({ target: { result: dataUri } } as ProgressEvent<FileReader>);
    }
  });
  (globalThis as any).FileReader = jest.fn().mockImplementation(() => ({
    readAsDataURL: mockReadAsDataURL,
    onload: null,
    onerror: null,
    result: dataUri,
  }));
}

function mockFileReaderFailure() {
  const mockReadAsDataURL = jest.fn(function (this: Partial<FileReader>) {
    if (this.onerror) {
      // @ts-ignore
      this.onerror(new Event('error'));
    }
  });
  (globalThis as any).FileReader = jest.fn().mockImplementation(() => ({
    readAsDataURL: mockReadAsDataURL,
    onload: null,
    onerror: null,
    result: null,
  }));
}

describe('useAvatar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as any).fetch = jest.fn();
  });

  it('returns undefined data when account is null (query disabled)', () => {
    const { result } = renderHook(() => useAvatar(null), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(result.current.fetchStatus).toBe('idle');
    expect((globalThis as any).fetch).not.toHaveBeenCalled();
  });

  it('returns base64 data URI string on successful fetch', async () => {
    const mockBlob = new Blob(['png-data'], { type: 'image/png' });
    ((globalThis as any).fetch as jest.Mock).mockResolvedValue({
      ok: true,
      blob: jest.fn().mockResolvedValue(mockBlob),
    });
    mockFileReaderSuccess(DATA_URI);

    const { result } = renderHook(() => useAvatar(account), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(DATA_URI);

    const expectedUrl =
      'https://cloud.example.com/index.php/avatar/john/96';
    expect((globalThis as any).fetch).toHaveBeenCalledWith(expectedUrl, {
      headers: {
        Authorization: expect.stringMatching(/^Basic /),
      },
    });
  });

  it('returns null on non-ok response', async () => {
    ((globalThis as any).fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
    });

    const { result } = renderHook(() => useAvatar(account), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('returns null on network error', async () => {
    ((globalThis as any).fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAvatar(account), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
    expect(result.current.data).toBeUndefined();
  });

  it('sets isError when FileReader onerror fires', async () => {
    const mockBlob = new Blob(['png-data'], { type: 'image/png' });
    ((globalThis as any).fetch as jest.Mock).mockResolvedValue({
      ok: true,
      blob: jest.fn().mockResolvedValue(mockBlob),
    });
    mockFileReaderFailure();

    const { result } = renderHook(() => useAvatar(account), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
    expect(result.current.data).toBeUndefined();
  });
});
