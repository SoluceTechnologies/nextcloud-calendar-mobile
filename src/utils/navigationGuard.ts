export function createNavigationGuard(windowMs = 700) {
  let last = -Infinity;
  return (action: () => void): void => {
    const now = Date.now();
    if (now - last < windowMs) return;
    last = now;
    action();
  };
}
