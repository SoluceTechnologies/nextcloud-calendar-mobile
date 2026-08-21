import { useCallback, useState } from 'react';
import { UntrustedCertError } from '@/services/shared/trustedFetch';
import { addPin } from '@/services/shared/certPins';

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
