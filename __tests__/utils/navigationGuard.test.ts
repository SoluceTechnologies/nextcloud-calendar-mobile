import { createNavigationGuard } from '../../src/utils/navigationGuard';

describe('createNavigationGuard', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(0); });
  afterEach(() => { jest.useRealTimers(); });

  it('runs the first call', () => {
    const guard = createNavigationGuard(700);
    const fn = jest.fn();
    guard(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('drops a second call inside the cooldown window', () => {
    const guard = createNavigationGuard(700);
    const fn = jest.fn();
    guard(fn);
    jest.setSystemTime(300);
    guard(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('allows a call once the window has elapsed', () => {
    const guard = createNavigationGuard(700);
    const fn = jest.fn();
    guard(fn);
    jest.setSystemTime(800);
    guard(fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
