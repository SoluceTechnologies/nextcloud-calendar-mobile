import { renderHook, act } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import { useMonthReturn } from '@/features/calendar/hooks/useMonthReturn';
import type { ViewMode } from '@/types';

let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));

describe('useMonthReturn', () => {
  let handlers: (() => boolean)[];
  let removed: number;
  let switchMode: jest.Mock;

  beforeEach(() => {
    handlers = [];
    removed = 0;
    switchMode = jest.fn();
    mockFocused = true;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.push(handler as () => boolean);
      return { remove: () => { removed++; } };
    });
  });
  afterEach(() => { jest.restoreAllMocks(); });

  function setup() {
    return renderHook(({ mode }: { mode: ViewMode }) => useMonthReturn(mode, switchMode), {
      initialProps: { mode: 'month' as ViewMode },
    });
  }

  it('sends hardware back from a Day opened from Month back to Month', () => {
    const { result, rerender } = setup();
    const tappedDay = new Date(2026, 10, 13);
    act(() => { result.current.openDay(tappedDay); });
    expect(switchMode).toHaveBeenCalledWith('day', tappedDay);
    rerender({ mode: 'day' });
    expect(handlers).toHaveLength(1);
    expect(handlers[0]()).toBe(true);
    expect(switchMode).toHaveBeenLastCalledWith('month');
  });

  it('leaves back alone when Day was reached another way', () => {
    const { rerender } = setup();
    rerender({ mode: 'day' });
    expect(handlers).toHaveLength(0);
  });

  it('forgets the month origin after switching to another mode', () => {
    const { result, rerender } = setup();
    act(() => { result.current.openDay(new Date(2026, 10, 13)); });
    rerender({ mode: 'day' });
    rerender({ mode: 'week' });
    expect(removed).toBe(1);
    rerender({ mode: 'day' });
    expect(handlers).toHaveLength(1);
  });

  it('leaves back to the screen in front when the calendar is not focused', () => {
    const { result, rerender } = setup();
    act(() => { result.current.openDay(new Date(2026, 10, 13)); });
    mockFocused = false;
    rerender({ mode: 'day' });
    expect(handlers).toHaveLength(0);
    mockFocused = true;
    rerender({ mode: 'day' });
    expect(handlers).toHaveLength(1);
  });
});
