import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { haptic, ImpactFeedbackStyle } from '@/utils/haptics';
import { SNAP_MINUTES, resolveDraggedBounds, snapDeltaMinutes } from '../utils/dragMath';
import { hitTestEvent, type DragMode } from '../utils/hitTest';
import type { PositionedEvent } from '../utils/eventLayout';
import type { GridEvent } from '../utils/toGridEvents';

const LONG_PRESS_MS = 300;
const DAY_MINUTES = 1440;

const SETTLE_WATCHDOG_MS = 2500;

const MODE_MOVE = 0;
const MODE_RESIZE_START = 1;
const MODE_RESIZE_END = 2;

interface DragState {
  event: GridEvent;
  mode: DragMode;
  columnIndex: number;
  heightPx: number;
  settling?: { start: number; end: number };
}

interface Args {
  dates: Date[];
  layouts: PositionedEvent[][];
  hourRowHeight: number;
  columnWidth: number;
  onMoveEvent?: (event: GridEvent, nextStart: Date, nextEnd: Date) => void;
}

function clampColumnDelta(rawDelta: number, columnIndex: number, daysCount: number): number {
  'worklet';
  return Math.min(daysCount - 1 - columnIndex, Math.max(-columnIndex, rawDelta));
}

export function useEventDrag({
  dates,
  layouts,
  hourRowHeight,
  columnWidth,
  onMoveEvent,
}: Args) {
  const [drag, setDrag] = useState<DragState | null>(null);

  const translateY = useSharedValue(0);
  const height = useSharedValue(0);
  const translateX = useSharedValue(0);

  const topBase = useSharedValue(0);
  const heightBase = useSharedValue(0);
  const leftBase = useSharedValue(0);
  const modeFlag = useSharedValue(MODE_MOVE);
  const columnIndexSV = useSharedValue(0);
  const touchDownAt = useSharedValue(0);

  const live = useRef({ dates, layouts, hourRowHeight, columnWidth, onMoveEvent, drag });
  live.current = { dates, layouts, hourRowHeight, columnWidth, onMoveEvent, drag };

  const begin = useCallback((x: number, y: number) => {
    const s = live.current;
    if (s.columnWidth <= 0) return;
    const columnIndex = Math.floor(x / s.columnWidth);
    if (columnIndex < 0 || columnIndex >= s.dates.length) return;

    const hit = hitTestEvent(
      x - columnIndex * s.columnWidth,
      y,
      s.layouts[columnIndex] ?? [],
      s.columnWidth,
      s.hourRowHeight * 24,
    );
    if (!hit) return;

    const full = hit.event._event;
    if (full.isTask || full.readOnly) return;
    if (
      hit.event.start.getTime() !== full.dtstart.getTime() ||
      hit.event.end.getTime() !== full.dtend.getTime()
    ) {
      return;
    }

    const startMin = hit.event.start.getHours() * 60 + hit.event.start.getMinutes();
    const durationMin = (hit.event.end.getTime() - hit.event.start.getTime()) / 60_000;
    const startPx = (startMin / DAY_MINUTES) * s.hourRowHeight * 24;
    const heightPx = (durationMin / DAY_MINUTES) * s.hourRowHeight * 24;
    const leftPx = columnIndex * s.columnWidth;

    topBase.value = startPx;
    heightBase.value = heightPx;
    leftBase.value = leftPx;
    modeFlag.value =
      hit.mode === 'move'
        ? MODE_MOVE
        : hit.mode === 'resizeStart'
          ? MODE_RESIZE_START
          : MODE_RESIZE_END;
    columnIndexSV.value = columnIndex;

    translateY.value = startPx;
    height.value = heightPx;
    translateX.value = leftPx;

    haptic(ImpactFeedbackStyle.Medium);
    setDrag({ event: hit.event, mode: hit.mode, columnIndex, heightPx });
  }, [translateY, height, translateX, topBase, heightBase, leftBase, modeFlag]);

  const commit = useCallback((deltaMinutes: number, rawDeltaColumns: number) => {
    const s = live.current;
    const current = s.drag;
    if (!current || !s.onMoveEvent) {
      setDrag(null);
      return;
    }

    const deltaColumns =
      current.mode === 'move'
        ? Math.min(
            s.dates.length - 1 - current.columnIndex,
            Math.max(-current.columnIndex, rawDeltaColumns),
          )
        : 0;
    if (deltaMinutes === 0 && deltaColumns === 0) {
      setDrag(null);
      return;
    }

    const deltaDays = deltaColumns * DAY_MINUTES;
    const durationMin = (current.event.end.getTime() - current.event.start.getTime()) / 60_000;

    const clampedDelta =
      current.mode === 'resizeStart'
        ? Math.min(deltaMinutes, durationMin - SNAP_MINUTES)
        : current.mode === 'resizeEnd'
          ? Math.max(deltaMinutes, SNAP_MINUTES - durationMin)
          : deltaMinutes;

    const bounds =
      current.mode === 'move'
        ? resolveDraggedBounds(
            current.event.start,
            current.event.end,
            deltaMinutes + deltaDays,
            deltaMinutes + deltaDays,
            SNAP_MINUTES,
          )
        : current.mode === 'resizeStart'
          ? resolveDraggedBounds(current.event.start, current.event.end, clampedDelta, 0, SNAP_MINUTES)
          : resolveDraggedBounds(current.event.start, current.event.end, 0, clampedDelta, SNAP_MINUTES);

    if (!bounds) {
      setDrag(null);
      return;
    }
    setDrag({ ...current, settling: { start: bounds.start.getTime(), end: bounds.end.getTime() } });
    s.onMoveEvent(current.event, bounds.start, bounds.end);
  }, []);

  const cancel = useCallback(() => setDrag((d) => (d?.settling ? d : null)), []);

  useEffect(() => {
    if (!drag?.settling) return;
    const { start, end } = drag.settling;
    const uid = drag.event._event.uid;
    const landed = layouts.some((column) =>
      column.some(
        (p) =>
          p.event._event.uid === uid &&
          p.event.start.getTime() === start &&
          p.event.end.getTime() === end,
      ),
    );
    if (landed) setDrag(null);
  }, [drag, layouts]);

  const settleKey = drag?.settling
    ? `${drag.event._event.uid}:${drag.settling.start}:${drag.settling.end}`
    : null;
  useEffect(() => {
    if (!settleKey) return;
    const timer = setTimeout(() => setDrag((d) => (d?.settling ? null : d)), SETTLE_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [settleKey]);

  const gesture = useMemo(() => {
    const daysCount = dates.length;

    return Gesture.Pan()
      .manualActivation(true)
      .maxPointers(1)
      .onTouchesDown(() => {
        touchDownAt.value = Date.now();
      })
      .onTouchesMove((_, manager) => {
        if (Date.now() - touchDownAt.value >= LONG_PRESS_MS) manager.activate();
      })
      .onStart((e) => {
        scheduleOnRN(begin, e.x, e.y);
      })
      .onUpdate((e) => {
        const snapped = snapDeltaMinutes(e.translationY, hourRowHeight, SNAP_MINUTES);
        const offsetPx = (snapped / 60) * hourRowHeight;
        const minPx = (SNAP_MINUTES / 60) * hourRowHeight;

        if (modeFlag.value === MODE_MOVE) {
          const rawColumns = Math.round(e.translationX / columnWidth);
          const columns = clampColumnDelta(rawColumns, columnIndexSV.value, daysCount);
          translateY.value = topBase.value + offsetPx;
          translateX.value = leftBase.value + columns * columnWidth;
          return;
        }

        translateX.value = leftBase.value;
        if (modeFlag.value === MODE_RESIZE_START) {
          const clamped = Math.min(offsetPx, heightBase.value - minPx);
          translateY.value = topBase.value + clamped;
          height.value = heightBase.value - clamped;
        } else {
          translateY.value = topBase.value;
          height.value = Math.max(minPx, heightBase.value + offsetPx);
        }
      })
      .onEnd((e, success) => {
        if (!success) return;
        const snapped = snapDeltaMinutes(e.translationY, hourRowHeight, SNAP_MINUTES);
        const columnDelta =
          modeFlag.value === MODE_MOVE ? Math.round(e.translationX / columnWidth) : 0;
        scheduleOnRN(commit, snapped, columnDelta);
      })
      .onFinalize(() => {
        scheduleOnRN(cancel);
      });
  }, [
    begin, commit, cancel, hourRowHeight, columnWidth, dates.length,
    translateY, height, translateX, topBase, heightBase, leftBase, modeFlag,
    touchDownAt,
  ]);

  return { gesture, drag, translateX, translateY, height };
}
