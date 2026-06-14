/**
 * Drops calls that arrive within `windowMs` of the previous accepted call.
 * Used to stop a double-tap on an event from pushing the same screen twice.
 */
export function createNavigationGuard(windowMs = 700) {
  let last = -Infinity;
  return (action: () => void): void => {
    const now = Date.now();
    if (now - last < windowMs) return;
    last = now;
    action();
  };
}
