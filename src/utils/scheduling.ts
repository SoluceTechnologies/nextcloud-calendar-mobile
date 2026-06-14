import { InteractionManager } from 'react-native';

/**
 * Cooperative yield for heavy, JS-thread-bound work (e.g. ICS parsing).
 *
 * React Native has no Web Workers, so CPU work runs on the same JS thread that
 * services touches, gesture `runOnJS` callbacks and React commits. A long
 * synchronous loop therefore freezes the UI. Calling `await yieldToUI()`
 * between work slices:
 *   1. Returns control to the event loop (`setTimeout(0)`) so queued touches,
 *      gesture callbacks and pending renders flush.
 *   2. Waits for any active interaction/animation to settle
 *      (`InteractionManager`) so user input always takes priority over
 *      background work.
 *   3. Resumes within `maxWaitMs` regardless, so a continuous interaction can
 *      never starve the background work indefinitely.
 */
export function yieldToUI(maxWaitMs = 250): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    // Hand the thread back, then resume after interactions settle…
    setTimeout(() => {
      InteractionManager.runAfterInteractions(finish);
    }, 0);
    // …but never wait longer than maxWaitMs (anti-starvation cap).
    setTimeout(finish, maxWaitMs);
  });
}
