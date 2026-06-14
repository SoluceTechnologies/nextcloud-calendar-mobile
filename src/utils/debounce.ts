export interface TrailingDebounce<A extends any[]> {
  /** Schedule fn(...args); a later call before the delay replaces the args. */
  call: (...args: A) => void;
  /** Run any pending call right now and clear the timer. */
  flush: () => void;
  /** Drop any pending call without running it. */
  cancel: () => void;
}

export function trailingDebounce<A extends any[]>(
  fn: (...args: A) => void,
  ms: number,
): TrailingDebounce<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: A | null = null;

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    lastArgs = null;
  };

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (lastArgs) {
      const a = lastArgs;
      lastArgs = null;
      fn(...a);
    }
  };

  const call = (...args: A) => {
    lastArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const a = lastArgs!;
      lastArgs = null;
      fn(...a);
    }, ms);
  };

  return { call, flush, cancel };
}
