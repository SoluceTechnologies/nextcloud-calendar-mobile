import { useCallback, useState } from 'react';
import { CleartextNotConsentedError } from '@/services/shared/trustedFetch';
import { addCleartextConsent } from '@/services/shared/cleartextConsent';

export function useCleartextConsent() {
  const [pending, setPending] = useState<CleartextNotConsentedError | null>(null);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof CleartextNotConsentedError) {
        setPending(e);
        return undefined;
      }
      throw e;
    }
  }, []);

  const confirm = useCallback(() => {
    if (pending) addCleartextConsent(pending.host);
    setPending(null);
  }, [pending]);

  const dismiss = useCallback(() => setPending(null), []);

  return { pending, run, confirm, dismiss };
}
