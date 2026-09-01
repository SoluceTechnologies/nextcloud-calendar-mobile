import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
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
const AUTO_SCROLL_MARGIN = 40;
const AUTO_SCROLL_SPEED = 6;

interface UseSlotDragOptions {
  initialStart: Date;
  durationMs: number;
  hourRowHeight: number;
  columnWidth: number;
  daysCount: number;
  initialColumnIndex: number;
  mergedBusy: BusySlot[];
  brickRef?: RefObject<{ measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void } | null>;
  viewportHeight?: number;
  onAutoScroll?: (delta: number) => number;
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
  brickRef,
  viewportHeight,
  onAutoScroll,
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

  const scrollCompensation = useSharedValue(0);
  const brickTopAtStart = useSharedValue(0);
  const brickBottomAtStart = useSharedValue(0);
  const brickMeasured = useRef(false);

  const startMin = initialStart.getHours() * 60 + initialStart.getMinutes();
  const durationMin = durationMs / 60_000;
  const gridHeight = hourRowHeight * 24;
  const brickTopBaseY = (startMin / DAY_MINUTES) * gridHeight;
  const brickHeight = (durationMin / DAY_MINUTES) * gridHeight;
  const minTranslateY = -brickTopBaseY;
  const maxTranslateY = gridHeight - brickTopBaseY - brickHeight;

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

  const live = useRef({ initialStart, durationMs, mergedBusy, onCommit, onReject, onAutoScroll, viewportHeight });
  live.current = { initialStart, durationMs, mergedBusy, onCommit, onReject, onAutoScroll, viewportHeight };

  const heightPx = (durationMin / DAY_MINUTES) * gridHeight;

  useEffect(() => {
    topBase.value = 0;
    heightBase.value = heightPx;
    leftBase.value = 0;
    columnIndexSV.value = initialColumnIndex;
    translateY.value = 0;
    translateX.value = 0;
    height.value = heightPx;
    scrollCompensation.value = 0;
    brickMeasured.current = false;
  }, [initialStartMs, heightPx, initialColumnIndex, height, heightBase, leftBase, topBase, translateX, translateY, columnIndexSV, scrollCompensation]);

  const isSlotFree = useCallback((startMs: number, endMs: number) => {
    const flat = busyFlatSV.value;
    for (let i = 0; i < flat.length; i += 2) {
      if (startMs < flat[i + 1] && flat[i] < endMs) {
        return false;
      }
    }
    return true;
  }, [busyFlatSV]);

  const computeDeltas = useCallback((dy: number, dx: number) => {
    const proposedY = dy + scrollCompensation.value;
    const clampedY = Math.max(minTranslateY, Math.min(maxTranslateY, proposedY));
    const rawMinutes = (clampedY / hourRowHeight) * 60;
    const snapped = Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES;
    const clampedMinutes = Math.max(-startMin, Math.min(DAY_MINUTES - startMin - durationMin, snapped));

    const rawColumns = Math.round(dx / columnWidthSV.value);
    const columns = Math.min(
      daysCountSV.value - 1 - columnIndexSV.value,
      Math.max(-columnIndexSV.value, rawColumns),
    );

    return { deltaMinutes: clampedMinutes, columns, clampedY };
  }, [hourRowHeight, startMin, durationMin, minTranslateY, maxTranslateY, columnWidthSV, daysCountSV, columnIndexSV, scrollCompensation]);

  const applyVisuals = useCallback((deltaMinutes: number, columns: number, clampedY: number) => {
    const offsetPx = (deltaMinutes / 60) * hourRowHeight;
    translateY.value = topBase.value + offsetPx;
    translateX.value = leftBase.value + columns * columnWidthSV.value;

    const deltaMs = deltaMinutes * 60_000 + columns * DAY_MINUTES * 60_000;
    const newStart = initialStartMsSV.value + deltaMs;
    const newEnd = newStart + durationMsSV.value;
    isFree.value = isSlotFree(newStart, newEnd);
  }, [hourRowHeight, initialStartMsSV, durationMsSV, columnWidthSV, isSlotFree, translateY, translateX, topBase, leftBase, isFree]);

  const commit = useCallback((dy: number, dx: number) => {
    const s = live.current;
    const { deltaMinutes, columns } = computeDeltas(dy, dx);

    if (deltaMinutes === 0 && columns === 0) return;

    const initialEnd = new Date(s.initialStart.getTime() + s.durationMs);
    const totalDeltaMin = deltaMinutes + columns * DAY_MINUTES;
    const bounds = resolveDraggedBounds(
      s.initialStart,
      initialEnd,
      totalDeltaMin,
      totalDeltaMin,
      SNAP_MINUTES,
    );

    if (!bounds) {
      translateY.value = withSpring(topBase.value, { damping: 15, stiffness: 150 });
      translateX.value = withSpring(leftBase.value, { damping: 15, stiffness: 150 });
      s.onReject();
      return;
    }

    // Final free check against the latest busy data
    const startMs = bounds.start.getTime();
    const endMs = bounds.end.getTime();
    const flat = busyFlatSV.value;
    let free = true;
    for (let i = 0; i < flat.length; i += 2) {
      if (startMs < flat[i + 1] && flat[i] < endMs) {
        free = false;
        break;
      }
    }

    if (!free) {
      translateY.value = withSpring(topBase.value, { damping: 15, stiffness: 150 });
      translateX.value = withSpring(leftBase.value, { damping: 15, stiffness: 150 });
      s.onReject();
      return;
    }

    s.onCommit(bounds.start, bounds.end);
  }, [computeDeltas, daysCount, initialColumnIndex, translateY, translateX, topBase, leftBase, busyFlatSV]);

  const cancel = useCallback(() => {
    translateY.value = withSpring(topBase.value, { damping: 15, stiffness: 150 });
    translateX.value = withSpring(leftBase.value, { damping: 15, stiffness: 150 });
  }, [translateY, translateX, topBase, leftBase]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: () => {
      dragActive.value = true;
      haptic(ImpactFeedbackStyle.Medium);
      brickMeasured.current = false;
      brickRef?.current?.measureInWindow?.((x, y, w, h) => {
        brickTopAtStart.value = y;
        brickBottomAtStart.value = y + h;
        brickMeasured.current = true;
      });
    },
    onPanResponderMove: (_event, gestureState) => {
      if (!dragActive.value) return;

      const { viewportHeight: vh, onAutoScroll: autoScroll } = live.current;

      if (brickMeasured.current && vh && vh > 0 && autoScroll) {
        const proposedY = gestureState.dy + scrollCompensation.value;
        const clampedY = Math.max(minTranslateY, Math.min(maxTranslateY, proposedY));
        const brickTop = brickTopAtStart.value + (clampedY - scrollCompensation.value);
        const brickBottom = brickBottomAtStart.value + (clampedY - scrollCompensation.value);

        let autoScrollDelta = 0;
        if (brickTop < AUTO_SCROLL_MARGIN && clampedY > minTranslateY) {
          autoScrollDelta = -Math.min(AUTO_SCROLL_SPEED, clampedY - minTranslateY);
        } else if (brickBottom > vh - AUTO_SCROLL_MARGIN && clampedY < maxTranslateY) {
          autoScrollDelta = Math.min(AUTO_SCROLL_SPEED, maxTranslateY - clampedY);
        }

        if (autoScrollDelta !== 0) {
          const applied = autoScroll(autoScrollDelta);
          scrollCompensation.value += applied;
        }
      }

      const { deltaMinutes, columns, clampedY } = computeDeltas(gestureState.dy, gestureState.dx);
      applyVisuals(deltaMinutes, columns, clampedY);
    },
    onPanResponderRelease: (_event, gestureState) => {
      if (!dragActive.value) return;
      dragActive.value = false;
      commit(gestureState.dy, gestureState.dx);
    },
    onPanResponderTerminate: () => {
      dragActive.value = false;
      cancel();
    },
  }), [
    computeDeltas, applyVisuals, commit, cancel, hourRowHeight,
    translateY, translateX, topBase, leftBase, isFree, dragActive,
    initialStartMsSV, durationMsSV, columnWidthSV, daysCountSV, busyFlatSV, columnIndexSV,
    brickRef, brickTopAtStart, brickBottomAtStart, scrollCompensation,
    minTranslateY, maxTranslateY,
  ]);

  return { panHandlers: panResponder.panHandlers, translateY, translateX, height, isFree };
}
