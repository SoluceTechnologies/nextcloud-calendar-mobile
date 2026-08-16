import { useCallback, useState } from 'react';
import { UntrustedCertError } from '@/services/shared/trustedFetch';
import { addPin } from '@/services/shared/certPins';

/**
 * Orchestrates the trust-on-first-use flow for a self-signed certificate.
 *
 * `run(fn)` executes a network attempt; if it throws `UntrustedCertError`, the
 * error is captured as `pending` and `run` resolves `undefined` (so the caller
 * can show the trust sheet). After the user confirms, `confirm()` pins the leaf
 * and clears `pending`; the caller then re-invokes its attempt. Non-cert errors
 * propagate unchanged.
 */
export function useCertTrust() {
  const [pending, setPending] = useState<UntrustedCertError | null>(null);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof UntrustedCertError) {
        setPending(e);
        return undefined;
      }
      throw e;
    }
  }, []);

  const confirm = useCallback(() => {
    if (pending) addPin(pending.host, pending.sha256);
    setPending(null);
  }, [pending]);

  const dismiss = useCallback(() => setPending(null), []);

  return { pending, run, confirm, dismiss };
}
