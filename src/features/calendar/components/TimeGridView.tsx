import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { anchoredScrollY, scaledCellHeight } from '../utils/zoomAnchor';
import { useTheme } from 'expo-router';
import InfinitePager, { type InfinitePagerImperativeApi } from 'react-native-infinite-pager';
import type { CalendarEvent } from '@/types';
import type { CalMode } from '../constants';
import {
  DAY_HEADER_HEIGHT,
  HOUR_RAIL_WIDTH,
  allDayRowHeight,
  buildDayIndex,
  pageDates,
  pageFocusDate,
  pageIndexForDate,
  stabilizeDayIndex,
} from '../utils/grid';
import type { GridEvent } from '../utils/toGridEvents';
import { GridLines } from './GridLines';
import { HourRail } from './HourRail';
import { TimeGridHeader } from './TimeGridHeader';
import { TimeGridPage } from './TimeGridPage';

const MAX_ANIMATED_JUMP_PAGES = 2;

interface Props {
  mode: CalMode;
  anchorDate: Date;
  activeDate: Date;
  events: GridEvent[];
  allDayEvents: CalendarEvent[];
  hourRowHeight: number;
  cellHeight: SharedValue<number>;
  weekStartsOn: 0 | 1;
  active: boolean;
  jump: { nonce: number; target: Date };
  commitZoom: (h: number) => void;
  initialScrollHour: number;
  onPageChange: (focusDate: Date) => void;
  onPressSlot: (d: Date) => void;
  onPressEvent: (e: GridEvent) => void;
  onPressAllDayEvent: (e: CalendarEvent) => void;
  onMoveEvent?: (event: GridEvent, nextStart: Date, nextEnd: Date) => void;
}

function TimeGridViewImpl({
  mode, anchorDate, activeDate, events, allDayEvents, hourRowHeight, cellHeight, weekStartsOn,
  active, jump, commitZoom, initialScrollHour, onPageChange, onPressSlot, onPressEvent,
  onPressAllDayEvent, onMoveEvent,
}: Props) {
  const activeRef = useRef(active); activeRef.current = active;
  const { colors } = useTheme();
  const pagerRef = useRef<InfinitePagerImperativeApi>(null);

  const syncNode = useSharedValue(0);

  const nativeScroll = useMemo(() => Gesture.Native(), []);

  const prevDayIndex = useRef<Map<string, GridEvent[]>>(new Map());
  const dayIndex = useMemo(() => {
    const next = stabilizeDayIndex(buildDayIndex(events), prevDayIndex.current);
    prevDayIndex.current = next;
    return next;
  }, [events]);

  const gridHeightStyle = useAnimatedStyle(() => ({ height: cellHeight.value * 24 }), [cellHeight]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const [localAnchor, setLocalAnchor] = useState(anchorDate);
  useEffect(() => { setLocalAnchor(anchorDate); }, [anchorDate]);

  const datesForIndex = useMemo(() => {
    const cache = new Map<number, Date[]>();
    return (index: number) => {
      let dates = cache.get(index);
      if (!dates) {
        dates = pageDates(localAnchor, index, mode, weekStartsOn);
        cache.set(index, dates);
      }
      return dates;
    };
  }, [localAnchor, mode, weekStartsOn]);

  const activeIndex = useMemo(
    () => pageIndexForDate(localAnchor, activeDate, mode, weekStartsOn),
    [localAnchor, activeDate, mode, weekStartsOn]
  );
  const [settledIndex, setSettledIndex] = useState(activeIndex);
  useEffect(() => { setSettledIndex(activeIndex); }, [activeIndex]);
  const settledIndexRef = useRef(settledIndex);
  settledIndexRef.current = settledIndex;

  const headerHeight = useMemo(
    () => DAY_HEADER_HEIGHT + allDayRowHeight(datesForIndex(settledIndex), allDayEvents),
    [datesForIndex, settledIndex, allDayEvents]
  );

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useSharedValue(initialScrollHour * hourRowHeight);
  const prevHeaderHeight = useRef(headerHeight);
  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  useLayoutEffect(() => {
    const delta = headerHeight - prevHeaderHeight.current;
    prevHeaderHeight.current = headerHeight;
    if (delta === 0) return;
    const y = Math.max(0, scrollY.value + delta);
    scrollY.value = y;
    scrollRef.current?.scrollTo({ y, animated: false });
  }, [headerHeight, scrollY, scrollRef]);

  const initialOffset = useRef({ x: 0, y: initialScrollHour * hourRowHeight }).current;

  const pinchBase = useSharedValue(hourRowHeight);
  const pinchStartScrollY = useSharedValue(0);
  const headerInset = useSharedValue(headerHeight);
  useEffect(() => { headerInset.value = headerHeight; }, [headerHeight, headerInset]);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          pinchBase.value = cellHeight.value;
          pinchStartScrollY.value = scrollY.value;
        })
        .onUpdate((e) => {
          const next = scaledCellHeight(pinchBase.value, e.scale);
          const y = anchoredScrollY({
            scrollY: pinchStartScrollY.value,
            focalY: e.focalY,
            headerInset: headerInset.value,
            fromCellHeight: pinchBase.value,
            toCellHeight: next,
          });
          cellHeight.value = next;
          scrollY.value = y;
          scrollTo(scrollRef, 0, y, false);
        })
        .onEnd(() => {
          scheduleOnRN(commitZoom, cellHeight.value);
        }),
    [commitZoom, cellHeight, pinchBase, pinchStartScrollY, headerInset, scrollY, scrollRef]
  );

  const simultaneous = useMemo(
    () => [nativeScroll, pinchGesture],
    [nativeScroll, pinchGesture]
  );

  const [pagerKey, setPagerKey] = useState(0);
  const firstAnchorReset = useRef(true);
  useLayoutEffect(() => {
    if (firstAnchorReset.current) {
      firstAnchorReset.current = false;
      return;
    }
    syncNode.value = 0;
    setSettledIndex(0);
    setPagerKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localAnchor, mode]);

  const jumpInputs = useRef({ localAnchor, mode, weekStartsOn });
  jumpInputs.current = { localAnchor, mode, weekStartsOn };
  const firstJump = useRef(true);
  useEffect(() => {
    if (firstJump.current) {
      firstJump.current = false;
      return;
    }
    if (!activeRef.current) return;
    const { localAnchor: a, mode: m, weekStartsOn: w } = jumpInputs.current;
    const target = pageIndexForDate(a, jump.target, m, w);
    const from = settledIndexRef.current;
    if (target === from) return;

    if (Math.abs(target - from) <= MAX_ANIMATED_JUMP_PAGES) {
      setSettledIndex(target);
      pagerRef.current?.setPage(target, { animated: true });
      return;
    }
    setLocalAnchor(jump.target);
  }, [jump]);

  const handlePageChange = useCallback(
    (index: number) => {
      setSettledIndex(index);
      onPageChange(pageFocusDate(localAnchor, index, mode, weekStartsOn));
    },
    [localAnchor, mode, weekStartsOn, onPageChange]
  );

  const renderHeaderPage = useCallback(
    ({ index }: { index: number }) => (
      <TimeGridHeader
        dates={datesForIndex(index)}
        now={now}
        allDayEvents={allDayEvents}
        onPressEvent={onPressAllDayEvent}
      />
    ),
    [datesForIndex, now, allDayEvents, onPressAllDayEvent]
  );

  const renderGridPage = useCallback(
    ({ index }: { index: number }) => (
      <TimeGridPage
        dates={datesForIndex(index)}
        dayIndex={dayIndex}
        hourRowHeight={hourRowHeight}
        now={now}
        onPressSlot={onPressSlot}
        onPressEvent={onPressEvent}
        onMoveEvent={onMoveEvent}
      />
    ),
    [datesForIndex, dayIndex, hourRowHeight, now, onPressSlot, onPressEvent, onMoveEvent]
  );

  return (
    <GestureDetector gesture={pinchGesture}>
      <View style={styles.fill}>
        {/* The scroll fills the whole area and the opaque header floats over it.
            The content inset is the FIXED part of the header only (the day-number
            row); the variable all-day band overlays the top of the grid instead of
            displacing it. That is what Google Calendar does — swiping onto a week
            that has all-day events leaves every hour line at the same pixel, the
            header simply covers more of the grid. Insetting by the full header
            height instead would shove the content down by the band's height on
            every such swipe, which reads as the grid jumping back toward 00:00. */}
        <GestureDetector gesture={nativeScroll}>
          <Animated.ScrollView
            ref={scrollRef}
            style={styles.fill}
            contentContainerStyle={{ paddingTop: headerHeight }}
            contentOffset={initialOffset}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
          >
            <Animated.View style={[styles.gridRow, gridHeightStyle]}>
              {/* Behind the rail and the pager: one set of horizontal rules for
                  the whole grid rather than 24 flex cells per day column. The
                  opaque rail covers the part that runs behind it. */}
              <GridLines />
              <HourRail />
              <InfinitePager
                key={pagerKey}
                ref={pagerRef}
                style={styles.fill}
                pageWrapperStyle={styles.fill}
                renderPage={renderGridPage}
                syncNode={syncNode}
                onPageChange={handlePageChange}
                simultaneousGestures={simultaneous}
                pageBuffer={1}
              />
            </Animated.View>
          </Animated.ScrollView>
        </GestureDetector>

        <View
          testID="time-grid-header-row"
          style={[
            styles.headerRow,
            {
              height: headerHeight,
              borderBottomColor: colors.border,
              backgroundColor: colors.background,
            },
          ]}
        >
          <View style={[styles.corner, { backgroundColor: colors.background }]} />
          <InfinitePager
            key={pagerKey}
            style={styles.fill}
            pageWrapperStyle={styles.fill}
            height={headerHeight}
            renderPage={renderHeaderPage}
            syncNode={syncNode}
            gesturesDisabled
            pageBuffer={1}
          />
        </View>
      </View>
    </GestureDetector>
  );
}

export const TimeGridView = memo(TimeGridViewImpl);

const styles = StyleSheet.create({
  fill: { flex: 1 },
  headerRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    borderBottomWidth: 2,
    zIndex: 20,
    overflow: 'hidden',
  },
  corner: { width: HOUR_RAIL_WIDTH, zIndex: 10 },
  gridRow: { flexDirection: 'row' },
});
