import { renderHook, act } from '@testing-library/react-native';
import { useCalendarNavigation } from '../../src/features/calendar/hooks/useCalendarNavigation';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

beforeAll(() => {
  // jest-expo has no requestIdleCallback; the hook uses it to prewarm cal modes.
  (globalThis as any).requestIdleCallback = (cb: any) =>
    setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 }), 0);
  (globalThis as any).cancelIdleCallback = (id: any) => clearTimeout(id);
});

describe('useCalendarNavigation', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('swipe updates date immediately but debounces fetchDate to the last value', () => {
    const { result } = renderHook(() => useCalendarNavigation());
    const d1 = new Date('2026-03-10T00:00:00Z');
    const d2 = new Date('2026-03-17T00:00:00Z');

    act(() => { result.current.onSwipeEndHandlers.week(d1); });
    expect(result.current.date).toEqual(d1);
    expect(result.current.fetchDate).not.toEqual(d1);

    act(() => { result.current.onSwipeEndHandlers.week(d2); });
    expect(result.current.date).toEqual(d2);

    act(() => { jest.advanceTimersByTime(300); });
    expect(result.current.fetchDate).toEqual(d2);
  });

  it('setDate updates fetchDate immediately and cancels a pending swipe', () => {
    const { result } = renderHook(() => useCalendarNavigation());
    const swiped = new Date('2026-04-01T00:00:00Z');
    const tapped = new Date('2026-05-15T00:00:00Z');

    act(() => { result.current.onSwipeEndHandlers.week(swiped); });
    act(() => { result.current.setDate(tapped); });
    expect(result.current.fetchDate).toEqual(tapped);

    act(() => { jest.advanceTimersByTime(300); });
    expect(result.current.fetchDate).toEqual(tapped);
  });
});
