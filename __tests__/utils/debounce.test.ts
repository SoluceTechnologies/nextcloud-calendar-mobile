import { trailingDebounce } from '../../src/utils/debounce';

describe('trailingDebounce', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('fires once with the last args after the delay', () => {
    const fn = jest.fn();
    const d = trailingDebounce(fn, 300);
    d.call(1);
    d.call(2);
    d.call(3);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
  });

  it('flush() fires the pending call immediately', () => {
    const fn = jest.fn();
    const d = trailingDebounce(fn, 300);
    d.call('x');
    d.flush();
    expect(fn).toHaveBeenCalledWith('x');
    jest.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1); // not fired again
  });

  it('cancel() drops the pending call', () => {
    const fn = jest.fn();
    const d = trailingDebounce(fn, 300);
    d.call('y');
    d.cancel();
    jest.advanceTimersByTime(300);
    expect(fn).not.toHaveBeenCalled();
  });
});
