import { useCallback, useEffect, useMemo, useRef } from 'react';
import { PanResponder, type GestureResponderHandlers } from 'react-native';
import {
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { haptic, ImpactFeedbackStyle } from '@/utils/haptics';
import { SNAP_MINUTES, resolveDraggedBounds, snapDeltaMinutes } from '@/features/calendar/utils/dragMath';
import type { BusySlot } from '@/types';

const DAY_MINUTES = 1440;

interface UseSlotDragOptions {
  initialStart: Date;
  durationMs: number;
  hourRowHeight: number;
  columnWidth: number;
  daysCount: number;
  initialColumnIndex: number;
  mergedBusy: BusySlot[];
  onCommit: (start: Date, end: Date) => void;
  onReject: () => void;
}

interface UseSlotDragResult {
  panHandlers: GestureResponderHandlers;
  translateY: SharedValue<number>;
  translateX: SharedValue<number>;
  height: SharedValue<number>;
  isFree: SharedValue<boolean>;
}

export function useSlotDrag({
  initialStart,
  durationMs,
  hourRowHeight,
  columnWidth,
  daysCount,
  initialColumnIndex,
  mergedBusy,
  onCommit,
  onReject,
}: UseSlotDragOptions): UseSlotDragResult {
  const initialStartMs = initialStart.getTime();
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const height = useSharedValue(0);
  const isFree = useSharedValue(true);
  const dragActive = useSharedValue(false);

  const topBase = useSharedValue(0);
  const heightBase = useSharedValue(0);
  const leftBase = useSharedValue(0);
  const columnIndexSV = useSharedValue(0);

  // SharedValues mirror the current slot data during the gesture
  const initialStartMsSV = useSharedValue(initialStartMs);
  const durationMsSV = useSharedValue(durationMs);
  const columnWidthSV = useSharedValue(columnWidth);
  const daysCountSV = useSharedValue(daysCount);
  const busyFlatSV = useSharedValue<number[]>(
    mergedBusy.flatMap((b) => [b.start.getTime(), b.end.getTime()]),
  );

  useEffect(() => {
    initialStartMsSV.value = initialStartMs;
  }, [initialStartMs, initialStartMsSV]);
  useEffect(() => {
    durationMsSV.value = durationMs;
  }, [durationMs, durationMsSV]);
  useEffect(() => {
    columnWidthSV.value = columnWidth;
  }, [columnWidth, columnWidthSV]);
  useEffect(() => {
    daysCountSV.value = daysCount;
  }, [daysCount, daysCountSV]);
  useEffect(() => {
    busyFlatSV.value = mergedBusy.flatMap((b) => [b.start.getTime(), b.end.getTime()]);
  }, [mergedBusy, busyFlatSV]);

  const live = useRef({ initialStart, durationMs, mergedBusy, onCommit, onReject });
  live.current = { initialStart, durationMs, mergedBusy, onCommit, onReject };

  const durationMin = durationMs / 60_000;
  const heightPx = (durationMin / DAY_MINUTES) * hourRowHeight * 24;

  useEffect(() => {
    topBase.value = 0;
    heightBase.value = heightPx;
    leftBase.value = 0;
    columnIndexSV.value = initialColumnIndex;
    translateY.value = 0;
    translateX.value = 0;
    height.value = heightPx;
  }, [initialStartMs, heightPx, initialColumnIndex, height, heightBase, leftBase, topBase, translateX, translateY, columnIndexSV]);

  const commit = useCallback((deltaMinutes: number, rawDeltaColumns: number) => {
    const s = live.current;


    const deltaColumns = Math.min(
      daysCount - 1 - initialColumnIndex,
      Math.max(-initialColumnIndex, rawDeltaColumns),
    );

    if (deltaMinutes === 0 && deltaColumns === 0) return;

    const initialEnd = new Date(s.initialStart.getTime() + s.durationMs);
    const totalDeltaMin = deltaMinutes + deltaColumns * DAY_MINUTES;
    const bounds = resolveDraggedBounds(
      s.initialStart,
      initialEnd,
      totalDeltaMin,
      totalDeltaMin,
      SNAP_MINUTES,
    );

    if (!bounds) {
      // Spring back
      translateY.value = withSpring(topBase.value, { damping: 15, stiffness: 150 });
      translateX.value = withSpring(leftBase.value, { damping: 15, stiffness: 150 });
      s.onReject();
      return;
    }

    // Check if the new slot is free
    const startMs = bounds.start.getTime();
    const endMs = bounds.end.getTime();
    let free = true;
    for (let i = 0; i < s.mergedBusy.length; i++) {
      const b = s.mergedBusy[i];
      if (startMs < b.end.getTime() && b.start.getTime() < endMs) {
        free = false;
        break;
      }
    }

    if (!free) {
      // Spring back
      translateY.value = withSpring(topBase.value, { damping: 15, stiffness: 150 });
      translateX.value = withSpring(leftBase.value, { damping: 15, stiffness: 150 });
      s.onReject();
      return;
    }

    s.onCommit(bounds.start, bounds.end);
  }, [daysCount, initialColumnIndex, translateY, translateX, topBase, leftBase, ]);

  const cancel = useCallback(() => {

    translateY.value = withSpring(topBase.value, { damping: 15, stiffness: 150 });
    translateX.value = withSpring(leftBase.value, { damping: 15, stiffness: 150 });
  }, [translateY, translateX, topBase, leftBase, ]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: () => {
      dragActive.value = true;
      haptic(ImpactFeedbackStyle.Medium);
    },
    onPanResponderMove: (_event, gestureState) => {
      if (!dragActive.value) return;
      const snapped = snapDeltaMinutes(gestureState.dy, hourRowHeight, SNAP_MINUTES);
      const offsetPx = (snapped / 60) * hourRowHeight;
      const rawColumns = Math.round(gestureState.dx / columnWidthSV.value);
      const columns = Math.min(
        daysCountSV.value - 1 - columnIndexSV.value,
        Math.max(-columnIndexSV.value, rawColumns),
      );

      translateY.value = topBase.value + offsetPx;
      translateX.value = leftBase.value + columns * columnWidthSV.value;

      // Compute isFree during the drag
      const deltaMs = snapped * 60_000 + columns * DAY_MINUTES * 60_000;
      const newStart = initialStartMsSV.value + deltaMs;
      const newEnd = newStart + durationMsSV.value;
      let free = true;
      const flat = busyFlatSV.value;
      for (let i = 0; i < flat.length; i += 2) {
        if (newStart < flat[i + 1] && flat[i] < newEnd) {
          free = false;
          break;
        }
      }
      isFree.value = free;
    },
    onPanResponderRelease: (_event, gestureState) => {
      if (!dragActive.value) return;
      dragActive.value = false;
      const snapped = snapDeltaMinutes(gestureState.dy, hourRowHeight, SNAP_MINUTES);
      const columnDelta = Math.round(gestureState.dx / columnWidthSV.value);
      commit(snapped, columnDelta);
    },
    onPanResponderTerminate: () => {
      dragActive.value = false;
      cancel();
    },
  }), [
    commit, cancel, hourRowHeight,
    translateY, translateX, topBase, leftBase, isFree, dragActive,
    initialStartMsSV, durationMsSV, columnWidthSV, daysCountSV, busyFlatSV, columnIndexSV,
  ]);

  return { panHandlers: panResponder.panHandlers, translateY, translateX, height, isFree };
}
