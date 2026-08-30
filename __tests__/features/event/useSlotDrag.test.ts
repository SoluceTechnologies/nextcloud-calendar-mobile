import { act, renderHook } from '@testing-library/react-native';
import { useSlotDrag } from '@/features/event/hooks/useSlotDrag';
import type { BusySlot } from '@/types';

jest.mock('@/utils/haptics', () => ({
  haptic: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

describe('useSlotDrag', () => {
  const initialStart = new Date('2026-08-28T10:00:00Z');
  const durationMs = 60 * 60 * 1000; // 1 hour
  const hourRowHeight = 48;
  const columnWidth = 100;
  const daysCount = 3;
  const initialColumnIndex = 1;

  it('returns responder handlers and animated values', () => {
    const onCommit = jest.fn();
    const onReject = jest.fn();
    const mergedBusy: BusySlot[] = [];

    const { result } = renderHook(() =>
      useSlotDrag({
        initialStart,
        durationMs,
        hourRowHeight,
        columnWidth,
        daysCount,
        initialColumnIndex,
        mergedBusy,
        onCommit,
        onReject,
      }),
    );

    expect(result.current.panHandlers).toBeDefined();
    expect(result.current.translateY).toBeDefined();
    expect(result.current.translateX).toBeDefined();
    expect(result.current.height).toBeDefined();
    expect(result.current.isFree).toBeDefined();
  });

  it('initializes isFree as true when no busy slots', () => {
    const onCommit = jest.fn();
    const onReject = jest.fn();

    const { result } = renderHook(() =>
      useSlotDrag({
        initialStart,
        durationMs,
        hourRowHeight,
        columnWidth,
        daysCount,
        initialColumnIndex,
        mergedBusy: [],
        onCommit,
        onReject,
      }),
    );

    expect(result.current.isFree.value).toBe(true);
  });

  it('claims the responder and refuses parent termination', () => {
    const { result } = renderHook(() =>
      useSlotDrag({
        initialStart,
        durationMs,
        hourRowHeight,
        columnWidth,
        daysCount,
        initialColumnIndex,
        mergedBusy: [],
        onCommit: jest.fn(),
        onReject: jest.fn(),
      }),
    );

    expect(result.current.panHandlers.onStartShouldSetResponder?.({} as any)).toBe(true);
    expect(result.current.panHandlers.onResponderTerminationRequest?.({} as any)).toBe(false);
  });

  it('clears translations when the committed start becomes the new base', () => {
    const { result, rerender } = renderHook<ReturnType<typeof useSlotDrag>, { start: Date }>(
      ({ start }) => useSlotDrag({
        initialStart: start,
        durationMs,
        hourRowHeight,
        columnWidth,
        daysCount,
        initialColumnIndex,
        mergedBusy: [],
        onCommit: jest.fn(),
        onReject: jest.fn(),
      }),
      { initialProps: { start: initialStart } },
    );

    act(() => {
      result.current.translateY.value = 48;
      result.current.translateX.value = 100;
    });
    rerender({ start: new Date(initialStart.getTime() + 60 * 60 * 1000) });

    expect(result.current.translateY.value).toBe(0);
    expect(result.current.translateX.value).toBe(0);
  });
});
