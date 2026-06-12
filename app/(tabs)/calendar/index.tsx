import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, TouchableOpacity, Text, StyleSheet, ScrollView,
  useWindowDimensions, Animated, ActivityIndicator, Platform,
} from 'react-native';
import { styles } from '@/styles/calendarScreen';
import { GestureDetector, Gesture, Pressable as GHPressable } from 'react-native-gesture-handler';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Calendar } from 'react-native-big-calendar';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { useAppStore } from '@/store/appStore';
import { useCalendars } from '@/hooks/useCalendars';
import { useTheme } from '@/hooks/useTheme';
import { FixedCalendarHeader } from '@/components/CalendarHeader';
import { CalendarDrawer } from '@/components/CalendarDrawer';
import { MonthDayView } from '@/components/MonthDayView';
import { loadAccounts } from '@/api/auth';
import { fetchEvents } from '@/api/caldav';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CalendarEvent, ViewMode } from '@/types';
import { computeOverlapMap } from '@/utils/overlapMap';
import { normalizeEvents } from '@/utils/normalizeEvent';
import { AgendaView, type AgendaViewHandle } from '@/components/AgendaView';
import { SUBSCRIBED_EVENTS_STALE } from '@/api/queryConfig';

dayjs.extend(isoWeek);

type CalMode = 'week' | '3days' | 'day';
const CAL_MODES: CalMode[] = ['week', '3days', 'day'];
const VIEW_MODES: ViewMode[] = ['month', 'week', '3days', 'day', 'schedule'];
const VIEW_LABELS: Record<ViewMode, string> = {
  month: 'Month', week: 'Week', '3days': '3D', day: 'Day', schedule: 'Agenda',
};
const DRAWER_WIDTH = 280;

export default function CalendarScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const activeAccountId = useAppStore((s) => s.activeAccountId);
  const viewMode = useAppStore((s) => s.viewMode);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const isCalendarMode = viewMode === 'week' || viewMode === '3days' || viewMode === 'day';
  const hiddenCalendarIds = useAppStore((s) => s.hiddenCalendarIds);
  const toggleCalendarVisibility = useAppStore((s) => s.toggleCalendarVisibility);
  const hourRowHeight = useAppStore((s) => s.hourRowHeight);
  const setHourRowHeight = useAppStore((s) => s.setHourRowHeight);
  const weekStartsOn = useAppStore((s) => s.weekStartsOn);
  const [calendarKey, setCalendarKey] = useState(0);
  const [committedHeight, setCommittedHeight] = useState(hourRowHeight);

  // Focus date: drives the header, Today button, event-fetch window, month + agenda.
  const [date, setDate] = useState(new Date());
  const [agendaVisibleDate, setAgendaVisibleDate] = useState(date);
  const agendaRef = useRef<AgendaViewHandle>(null);

  // Each time-grid mode owns a persistent <Calendar>, so switching modes is an
  // opacity flip — never a re-render. `calDates[m]` is the date prop fed to
  // instance m; changing it teleports that instance (5-page rebuild), so we
  // only change it on real navigation (Today / cross-mode sync), never on the
  // instance's own swipe. `calInternalRef[m]` tracks where instance m actually
  // sits so we can skip redundant re-sync teleports.
  const [calDates, setCalDates] = useState<Record<CalMode, Date>>(() => {
    const now = new Date();
    return { week: now, '3days': now, day: now };
  });
  const calInternalRef = useRef<Record<CalMode, Date>>({ ...calDates });
  // Lazily mount the non-active instances after first paint so cold start stays cheap.
  const [mountedCalModes, setMountedCalModes] = useState<Set<CalMode>>(
    () => new Set([isCalendarMode ? (viewMode as CalMode) : 'week'])
  );

  // Refs so event handlers read the latest values without re-subscribing.
  const dateRef = useRef(date); dateRef.current = date;
  const viewModeRef = useRef(viewMode); viewModeRef.current = viewMode;
  const agendaVisibleDateRef = useRef(agendaVisibleDate); agendaVisibleDateRef.current = agendaVisibleDate;

  // Real available height for the time-grid, measured from the laid-out view
  // container (the screen is inset above the tab bar). Beats estimating header +
  // tab-bar sizes in arithmetic, which left a small gap.
  const [availH, setAvailH] = useState(0);
  const onViewAreaLayout = useCallback((e: any) => {
    const h = e.nativeEvent.layout.height;
    setAvailH((prev) => (Math.abs(prev - h) > 1 ? h : prev));
  }, []);

  useEffect(() => { if (viewMode === 'schedule') setAgendaVisibleDate(date); }, [date, viewMode]);

  // Prewarm the other calendar instances once the UI is idle.
  useEffect(() => {
    const handle = requestIdleCallback(() => {
      setMountedCalModes((prev) =>
        prev.has('week') && prev.has('3days') && prev.has('day')
          ? prev
          : new Set<CalMode>(CAL_MODES)
      );
    }, { timeout: 800 });
    return () => cancelIdleCallback(handle);
  }, []);

  useFocusEffect(useCallback(() => {
    if (committedHeight !== hourRowHeight) {
      setCalendarKey((k) => k + 1);
      setCommittedHeight(hourRowHeight);
    }
  }, [hourRowHeight, committedHeight]));

  const scrollOffset = useMemo(() => {
    const now = new Date();
    const targetHour = Math.max(0, now.getHours() - 1);
    return Platform.OS === 'ios' ? targetHour * hourRowHeight : targetHour * 60;
  }, [hourRowHeight]);

  const pendingHeight = useSharedValue(hourRowHeight);
  const pinchBase = useSharedValue(hourRowHeight);

  const commitZoom = useCallback((h: number) => {
    setHourRowHeight(h);
    setCalendarKey((k) => k + 1);
  }, [setHourRowHeight]);

  // Switch view mode. For time-grid modes, lazily mount the instance and sync it
  // to the current focus date only if it has drifted (else the switch is a pure
  // opacity flip with zero re-render).
  const switchMode = useCallback((target: ViewMode) => {
    const f = viewModeRef.current === 'schedule' ? agendaVisibleDateRef.current : dateRef.current;
    if (target === 'week' || target === '3days' || target === 'day') {
      setMountedCalModes((prev) => (prev.has(target) ? prev : new Set(prev).add(target)));
      if (!dayjs(calInternalRef.current[target]).isSame(f, 'day')) {
        calInternalRef.current[target] = f;
        setCalDates((prev) => ({ ...prev, [target]: f }));
      }
    }
    if (target !== 'schedule' && !dayjs(f).isSame(dateRef.current, 'day')) setDate(f);
    setViewMode(target);
  }, [setViewMode]);

  const goToday = useCallback(() => {
    const now = new Date();
    setDate(now);
    const vm = viewModeRef.current;
    if (vm === 'schedule') {
      setAgendaVisibleDate(now);
      agendaRef.current?.scrollToToday();
    } else if (vm === 'week' || vm === '3days' || vm === 'day') {
      calInternalRef.current[vm] = now;
      setCalDates((prev) => ({ ...prev, [vm]: now }));
    }
  }, []);

  // One handler per instance: record where it moved + advance the fetch window,
  // without touching its date prop (which would teleport-rebuild it).
  const onSwipeEndHandlers = useMemo<Record<CalMode, (d: Date) => void>>(() => ({
    week: (d) => { calInternalRef.current.week = d; setDate(d); },
    '3days': (d) => { calInternalRef.current['3days'] = d; setDate(d); },
    day: (d) => { calInternalRef.current.day = d; setDate(d); },
  }), []);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => { pinchBase.value = hourRowHeight; })
        .onUpdate((e) => {
          pendingHeight.value = Math.min(Math.max(Math.round(pinchBase.value * e.scale), 30), 200);
        })
        .onEnd(() => { runOnJS(commitZoom)(pendingHeight.value); }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commitZoom]
  );

  const navigateMonth = useCallback((dir: 1 | -1) => {
    setDate((d) => dayjs(d).add(dir, 'month').toDate());
  }, []);

  const monthSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-30, 30])
        .failOffsetY([-15, 15])
        .onEnd((e) => {
          if (e.translationX < -50) runOnJS(navigateMonth)(1);
          else if (e.translationX > 50) runOnJS(navigateMonth)(-1);
        }),
    [navigateMonth]
  );

  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const drawerAnimation = useRef<Animated.CompositeAnimation | null>(null);

  const year = dayjs(date).year();
  const month = dayjs(date).month(); // 0-based
  const start = useMemo(() => new Date(year, month - 1, 1), [year, month]);
  const end = useMemo(() => new Date(year, month + 2, 0, 23, 59, 59, 999), [year, month]);

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: loadAccounts });
  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;

  const queryClient = useQueryClient();
  const { data: calendars = [], isLoading: calsLoading, isFetching: calsFetching } = useCalendars(activeAccount);
  const visibleCalendars = useMemo(
    () => calendars.filter((c) => !hiddenCalendarIds.includes(c.id)),
    [calendars, hiddenCalendarIds]
  );

  const prevCtagsRef = useRef<string>('');
  useEffect(() => {
    const current = calendars.map((c) => c.ctag).join(',');
    if (prevCtagsRef.current && prevCtagsRef.current !== current) {
      queryClient.invalidateQueries({ queryKey: [activeAccountId, 'events'] });
    }
    prevCtagsRef.current = current;
  }, [calendars, activeAccountId, queryClient]);

  const regularCalendars = useMemo(
    () => visibleCalendars.filter((c) => !c.isSubscribed),
    [visibleCalendars]
  );
  const subscribedCalendars = useMemo(
    () => visibleCalendars.filter((c) => c.isSubscribed),
    [visibleCalendars]
  );
  // Stable string keys so query keys / effect deps don't churn on every render.
  const regularIds = useMemo(() => regularCalendars.map((c) => c.id), [regularCalendars]);
  const subscribedKeys = useMemo(
    () => subscribedCalendars.map((c) => c.sourceUrl ?? c.id),
    [subscribedCalendars]
  );

  const { data: rawEvents = [], isLoading: eventsLoading, isFetching: eventsFetching } = useQuery<CalendarEvent[]>({
    queryKey: [activeAccountId, 'events', regularIds, start.toISOString(), end.toISOString()],
    queryFn: async () => {
      if (!activeAccount || regularCalendars.length === 0) return [];
      const results = await Promise.allSettled(
        regularCalendars.map((cal) => fetchEvents(activeAccount, cal, start, end))
      );
      return results.flatMap((r) => r.status === 'fulfilled' ? r.value : []);
    },
    enabled: activeAccount !== null && regularCalendars.length > 0,
    staleTime: Infinity,
  });

  const { data: subscribedEvents = [] } = useQuery<CalendarEvent[]>({
    queryKey: [activeAccountId, 'subscribed-events', subscribedKeys],
    queryFn: async () => {
      if (!activeAccount || subscribedCalendars.length === 0) return [];
      const results = await Promise.allSettled(
        subscribedCalendars.map((cal) => fetchEvents(activeAccount, cal, start, end))
      );
      return results.flatMap((r) => r.status === 'fulfilled' ? r.value : []);
    },
    enabled: activeAccount !== null && subscribedCalendars.length > 0,
    staleTime: SUBSCRIBED_EVENTS_STALE,
    retry: 2,
  });

  const allEvents = useMemo(
    () => normalizeEvents([...rawEvents, ...subscribedEvents]),
    [rawEvents, subscribedEvents]
  );

  useEffect(() => {
    if (!activeAccount || regularCalendars.length === 0) return;

    const prefetchMonth = (monthOffset: -1 | 1) => {
      const adjYear = dayjs(date).add(monthOffset, 'month').year();
      const adjMonth = dayjs(date).add(monthOffset, 'month').month();
      const adjStart = new Date(adjYear, adjMonth - 1, 1);
      const adjEnd = new Date(adjYear, adjMonth + 2, 0, 23, 59, 59, 999);
      queryClient.prefetchQuery({
        queryKey: [activeAccountId, 'events', regularIds, adjStart.toISOString(), adjEnd.toISOString()],
        queryFn: () =>
          Promise.allSettled(regularCalendars.map((cal) => fetchEvents(activeAccount, cal, adjStart, adjEnd)))
            .then((results) => results.flatMap((r) => r.status === 'fulfilled' ? r.value : [])),
        staleTime: Infinity,
      });
    };

    prefetchMonth(-1);
    prefetchMonth(1);
  }, [year, month, activeAccount, visibleCalendars, activeAccountId, queryClient]);

  const hadEventsRef = useRef(false);
  useEffect(() => { if (allEvents.length > 0) hadEventsRef.current = true; }, [allEvents]);
  useEffect(() => { hadEventsRef.current = false; }, [activeAccountId]);

  const showFullOverlay = !hadEventsRef.current && eventsLoading && allEvents.length === 0;
  const showSmallLoader = (eventsFetching || calsFetching) && !showFullOverlay;

  function openDrawer() {
    drawerAnimation.current?.stop();
    setDrawerOpen(true);
    drawerAnimation.current = Animated.parallel([
      Animated.spring(drawerAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
        mass: 0.8,
      }),
      Animated.timing(overlayAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]);
    drawerAnimation.current.start();
  }

  function closeDrawer() {
    drawerAnimation.current?.stop();
    drawerAnimation.current = Animated.parallel([
      Animated.spring(drawerAnim, {
        toValue: -DRAWER_WIDTH,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
        mass: 0.8,
      }),
      Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]);
    drawerAnimation.current.start(({ finished }) => {
      if (finished) setDrawerOpen(false);
    });
  }

  const overlapMap = useMemo(() => computeOverlapMap(allEvents), [allEvents]);

  const calendarEvents = useMemo(
    () => allEvents.map((e) => {
      const overlap = overlapMap.get(e.uid) ?? { leftPct: 0, rightPx: 3, zIndex: 100 };
      return {
        title: e.summary,
        start: e.dtstart,
        end: e.dtend,
        color: e.color,
        _event: e,
        _leftPct: overlap.leftPct,
        _rightPx: overlap.rightPx,
        _zIndex: overlap.zIndex,
      };
    }),
    [allEvents, overlapMap]
  );

  const renderEvent = useCallback((event: any, touchableOpacityProps: any) => {
    const scale = Math.min(Math.max((hourRowHeight - 30) / 170, 0), 1);
    const titleSize = Math.round(10 + scale * 4);
    const timeSize = Math.round(9 + scale * 2);
    const pad = Math.round(2 + scale * 4);
    const color = event.color ?? theme.primary;
    const durationMin = dayjs(event.end).diff(event.start, 'minute');

    const { key: eventKey, ...touchableProps } = touchableOpacityProps;

    const leftPct: number = event._leftPct ?? 0;
    const rightPx: number = event._rightPx ?? 3;
    const zIdx: number = event._zIndex ?? 100;

    const libStyle = StyleSheet.flatten(touchableProps.style) as any;

    const positionStyle = {
      position: 'absolute' as const,
      height: libStyle.height,
      top: libStyle.top,
      marginTop: libStyle.marginTop ?? 2,
      zIndex: zIdx,
      left: `${leftPct}%` as any,
      right: rightPx,
      paddingLeft: leftPct > 0 ? 2 : 3,
      paddingRight: 3,
    };

    return (
      <TouchableOpacity
        key={eventKey}
        {...touchableProps}
        style={[
          positionStyle,
          { backgroundColor: color, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', paddingVertical: Math.max(pad - 1, 1), overflow: 'hidden' },
        ]}
      >
        {durationMin < 30 ? (
          <Text style={{ fontSize: titleSize, color: '#fff', fontWeight: '600' }} numberOfLines={1}>
            {event.title}
          </Text>
        ) : (
          <>
            <Text style={{ fontSize: titleSize, color: '#fff', fontWeight: '600' }} numberOfLines={2}>
              {event.title}
            </Text>
            <Text style={{ fontSize: timeSize, color: 'rgba(255,255,255,0.85)' }} numberOfLines={1}>
              {dayjs(event.start).format('H:mm')}–{dayjs(event.end).format('H:mm')}
            </Text>
          </>
        )}
      </TouchableOpacity>
    );
  }, [hourRowHeight, theme.primary]);

  const handlePressEvent = useCallback(
    (event: any) => { router.push(`/event/${event._event.uid}`); },
    [router]
  );

  const eventCellStyle = useCallback(
    (event: any) => ({ backgroundColor: (event.color as string) || theme.primary }),
    [theme.primary]
  );

  // Stable object — inline would be a new ref each render and bust the lib's memo.
  const bigCalendarTheme = useMemo(
    () => ({
      palette: {
        primary: { main: theme.primary },
        gray: {
          '100': theme.borderSubtle,
          '200': theme.border,
          '500': theme.textSecondary,
          '800': theme.text,
        },
      },
    }),
    [theme.primary, theme.borderSubtle, theme.border, theme.textSecondary, theme.text]
  );

  const handlePressEventFromMonth = useCallback(
    (event: CalendarEvent) => { router.push(`/event/${event.uid}`); },
    [router]
  );

  const handlePressCell = useCallback(
    (d: Date) => { router.push({ pathname: '/event/new', params: { date: d.toISOString() } }); },
    [router]
  );

  const isToday = viewMode === 'schedule'
    ? dayjs(agendaVisibleDate).isSame(dayjs(), 'day')
    : dayjs(date).isSame(dayjs(), 'day');

  const headerTitle = useMemo(() => {
    const d = dayjs(viewMode === 'schedule' ? agendaVisibleDate : date);
    const monthYear = d.format('MMMM YYYY');
    if (viewMode === 'week' || viewMode === '3days' || viewMode === 'day') {
      return `${monthYear}  ·  W${d.isoWeek()}`;
    }
    return monthYear;
  }, [date, agendaVisibleDate, viewMode]);

  const headerHeight = 44 + 40 + insets.top;
  // Rough fallback only — the real height comes from the measured `availH`
  // (onLayout) below, so this is used for a single frame before measurement.
  const calHeight = windowHeight - headerHeight - insets.bottom - 49;

  // Per-instance header height, computed deterministically from the all-day
  // events in THAT instance's own visible range (mirrors CalendarHeader.tsx:
  // 8 top pad + 56 day row + 2 border = 66, plus maxPerDay·26 + 4 with all-day).
  // Per-instance (not global viewMode) so the height prop stays stable when you
  // flip modes — otherwise every instance would rebuild on each switch.
  const headerHeightFor = useCallback((m: CalMode, focusDate: Date) => {
    const DAY_ROW = 66, ALLDAY_ROW = 26, ALLDAY_PAD = 4;
    const allDay = allEvents.filter((e) => e.allDay);
    if (allDay.length === 0) return DAY_ROW;
    const focus = dayjs(focusDate);
    const span = m === 'week' ? 7 : m === '3days' ? 3 : 1;
    const startDow = focus.day();
    const rangeStart = m === 'week'
      ? focus.add(weekStartsOn - startDow - (startDow < weekStartsOn ? 7 : 0), 'day')
      : focus;
    let maxPerDay = 0;
    for (let i = 0; i < span; i++) {
      const ds = rangeStart.add(i, 'day').startOf('day');
      let c = 0;
      for (const e of allDay) {
        const s = dayjs(e.dtstart).startOf('day');
        const en = dayjs(e.dtend).startOf('day');
        if (!ds.isBefore(s) && !ds.isAfter(en)) c++;
      }
      if (c > maxPerDay) maxPerDay = c;
    }
    return DAY_ROW + (maxPerDay > 0 ? maxPerDay * ALLDAY_ROW + ALLDAY_PAD : 0);
  }, [allEvents, weekStartsOn]);

  // The lib sets its scroll body to `height − 3·hourRowHeight` (it assumes a
  // 3-row header). `calHeight` is the usable area above the tab bar; we give back
  // exactly that minus our real header so the calendar (header + body) ends flush
  // at the tab bar top: no gap, no overflow, no clipped 23:00/00:00.
  const calArea = availH > 0 ? availH : calHeight;
  const calHeightFor = useCallback(
    (m: CalMode, focusDate: Date) =>
      Math.max(calArea - headerHeightFor(m, focusDate) + hourRowHeight * 3, hourRowHeight * 3 + 1),
    [calArea, headerHeightFor, hourRowHeight]
  );

  const calendarKeyFull = `${calendarKey}-${theme.background}`;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={['top']} style={[styles.headerWrap, { backgroundColor: theme.headerBackground, borderBottomColor: theme.border }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={openDrawer} style={styles.hamburger}>
            <Text style={[styles.hamburgerIcon, { color: theme.primary }]}>☰</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
            {headerTitle}
          </Text>
          <TouchableOpacity
            style={[styles.todayBtn, { opacity: isToday ? 0.35 : 1 }]}
            onPress={goToday}
            disabled={isToday}
          >
            <Text style={[styles.todayBtnText, { color: theme.primary }]}>Today</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modePills}>
          {VIEW_MODES.map((mode) => (
            <GHPressable
              key={mode}
              style={[
                styles.modeBtn,
                { backgroundColor: theme.chip },
                viewMode === mode && { backgroundColor: theme.chipActive },
              ]}
              onPress={() => switchMode(mode)}
            >
              <Text
                style={[
                  styles.modeBtnText,
                  { color: theme.textSecondary },
                  viewMode === mode && { color: theme.primaryText, fontWeight: '600' },
                ]}
              >
                {VIEW_LABELS[mode]}
              </Text>
            </GHPressable>
          ))}
        </ScrollView>
      </SafeAreaView>

      {/* All three views stay mounted and laid out; switching is just an
          opacity/z-order/touch flip — no unmount/remount of the heavy trees,
          and horizontally-paged children keep their measured width. */}
      <View style={styles.viewContainer} onLayout={onViewAreaLayout}>
        <View
          style={[styles.viewLayer, viewMode === 'month' ? styles.layerActive : styles.layerHidden]}
          pointerEvents={viewMode === 'month' ? 'auto' : 'none'}
        >
          <GestureDetector gesture={monthSwipeGesture}>
            <View style={{ flex: 1 }}>
              <MonthDayView
                date={date}
                events={allEvents}
                weekStartsOn={weekStartsOn}
                onSelectDate={setDate}
                onPressEvent={handlePressEventFromMonth}
                onPressCell={handlePressCell}
              />
            </View>
          </GestureDetector>
        </View>

        <View
          style={[styles.viewLayer, viewMode === 'schedule' ? styles.layerActive : styles.layerHidden]}
          pointerEvents={viewMode === 'schedule' ? 'auto' : 'none'}
        >
          <AgendaView
            ref={agendaRef}
            events={allEvents}
            date={date}
            onPressEvent={handlePressEventFromMonth}
            onPressCell={handlePressCell}
            onVisibleDateChange={setAgendaVisibleDate}
          />
        </View>

        <View
          style={[styles.viewLayer, isCalendarMode ? styles.layerActive : styles.layerHidden]}
          pointerEvents={isCalendarMode ? 'auto' : 'none'}
        >
          <GestureDetector gesture={pinchGesture}>
            <View style={{ flex: 1 }}>
              {/* One persistent <Calendar> per time-grid mode, fixed-mode and
                  date-decoupled. Switching is an opacity flip with no re-render. */}
              {CAL_MODES.map((m) =>
                mountedCalModes.has(m) ? (
                  <View
                    key={m}
                    style={[StyleSheet.absoluteFill, { opacity: viewMode === m ? 1 : 0, zIndex: viewMode === m ? 1 : 0 }]}
                    pointerEvents={viewMode === m ? 'auto' : 'none'}
                  >
                    <View style={styles.calendarWrapper}>
                      <Calendar
                        key={calendarKeyFull}
                        events={calendarEvents}
                        mode={m}
                        date={calDates[m]}
                        height={calHeightFor(m, calDates[m])}
                        hourRowHeight={hourRowHeight}
                        timeslots={1}
                        weekStartsOn={weekStartsOn}
                        weekEndsOn={((weekStartsOn + 6) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6}
                        onPressEvent={handlePressEvent}
                        onPressCell={handlePressCell}
                        onSwipeEnd={onSwipeEndHandlers[m]}
                        scrollOffsetMinutes={scrollOffset}
                        renderHeader={FixedCalendarHeader}
                        renderEvent={renderEvent}
                        eventCellStyle={eventCellStyle}
                        allDayEventCellStyle={eventCellStyle}
                        theme={bigCalendarTheme}
                      />
                    </View>
                  </View>
                ) : null
              )}
            </View>
          </GestureDetector>
        </View>
      </View>

      {showFullOverlay && (
        <View style={[styles.loadingOverlay, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading calendar…</Text>
        </View>
      )}
      {showSmallLoader && (
        <ActivityIndicator
          size="small"
          color={theme.textSecondary}
          style={styles.smallLoader}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.primary, bottom: 16 }]}
        onPress={() => router.push('/event/new')}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      <CalendarDrawer
        open={drawerOpen}
        drawerAnim={drawerAnim}
        overlayAnim={overlayAnim}
        insets={insets}
        activeAccount={activeAccount}
        calendars={calendars}
        hiddenCalendarIds={hiddenCalendarIds}
        toggleCalendarVisibility={toggleCalendarVisibility}
        onClose={closeDrawer}
        onNavigateSettings={() => { closeDrawer(); router.push('/(tabs)/settings'); }}
      />
    </View>
  );
}
