import { renderHook, act } from '@testing-library/react-native';
import { useCertTrust } from '@/features/account/hooks/useCertTrust';
import { UntrustedCertError } from '@/services/shared/trustedFetch';
import { hasPin } from '@/services/shared/certPins';
import { storage } from '@/storage';

const mkErr = () =>
  new UntrustedCertError({
    type: 'untrusted_cert',
    host: 'h:443',
    sha256: 'AA',
    subject: 'CN=h',
    issuer: 'CN=h',
    notBefore: 'x',
    notAfter: 'y',
  });

describe('useCertTrust', () => {
  beforeEach(() => storage.clearAll());

  it('captures the cert error, pins on confirm, then the retry succeeds', async () => {
    const { result } = renderHook(() => useCertTrust());
    let attempts = 0;
    const fn = jest.fn(async () => {
      attempts++;
      if (attempts === 1) throw mkErr();
      return 'done';
    });

    let out: string | undefined;
    await act(async () => {
      out = await result.current.run(fn);
    });
    expect(out).toBeUndefined();
    expect(result.current.pending).not.toBeNull();

    act(() => result.current.confirm());
    expect(hasPin('h:443', 'AA')).toBe(true);
    expect(result.current.pending).toBeNull();

    await act(async () => {
      out = await result.current.run(fn);
    });
    expect(out).toBe('done');
  });

  it('dismiss clears the pending error without pinning', async () => {
    const { result } = renderHook(() => useCertTrust());
    await act(async () => {
      await result.current.run(async () => {
        throw mkErr();
      });
    });
    expect(result.current.pending).not.toBeNull();

    act(() => result.current.dismiss());
    expect(result.current.pending).toBeNull();
    expect(hasPin('h:443', 'AA')).toBe(false);
  });

  it('rethrows non-cert errors', async () => {
    const { result } = renderHook(() => useCertTrust());
    await expect(
      act(async () => {
        await result.current.run(async () => {
          throw new Error('boom');
        });
      }),
    ).rejects.toThrow('boom');
    expect(result.current.pending).toBeNull();
  });
});
