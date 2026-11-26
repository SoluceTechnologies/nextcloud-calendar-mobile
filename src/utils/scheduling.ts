type IdleCb = (cb: () => void, opts?: { timeout: number }) => void;

export function yieldToUI(maxWaitMs = 250): Promise<void> {
  return new Promise<void>((resolve) => {
    const ric = (globalThis as { requestIdleCallback?: IdleCb }).requestIdleCallback;
    if (typeof ric === 'function') {
      // The timeout option guarantees the callback fires within maxWaitMs.
      ric(() => resolve(), { timeout: maxWaitMs });
    } else {
      setTimeout(resolve, 0);
    }
  });
}
