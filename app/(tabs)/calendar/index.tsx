import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, TouchableOpacity, Text, StyleSheet, ScrollView,
  useWindowDimensions, Animated, ActivityIndicator, Platform,
} from 'react-native';
import { styles } from '@/styles/calendarScreen';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Calendar } from 'react-native-big-calendar';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { useAppStore } from '@/store/appStore';
import { useCalendars } from '@/hooks/useCalendars';
import { useTheme, getContrastColor } from '@/hooks/useTheme';
import { FixedCalendarHeader } from '@/components/CalendarHeader';
import { CalendarDrawer } from '@/components/CalendarDrawer';
import { loadAccounts } from '@/api/auth';
import { fetchEvents } from '@/api/caldav';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CalendarEvent, ViewMode } from '@/types';
import { computeOverlapMap } from '@/utils/overlapMap';

dayjs.extend(isoWeek);

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
  const hiddenCalendarIds = useAppStore((s) => s.hiddenCalendarIds);
  const toggleCalendarVisibility = useAppStore((s) => s.toggleCalendarVisibility);
  const hourRowHeight = useAppStore((s) => s.hourRowHeight);
  const setHourRowHeight = useAppStore((s) => s.setHourRowHeight);
  const weekStartsOn = useAppStore((s) => s.weekStartsOn);
  const [calendarKey, setCalendarKey] = useState(0);
  const [committedHeight, setCommittedHeight] = useState(hourRowHeight);

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

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          pinchBase.value = hourRowHeight;
        })
        .onUpdate((e) => {
          pendingHeight.value = Math.min(Math.max(Math.round(pinchBase.value * e.scale), 30), 200);
        })
        .onEnd(() => {
          runOnJS(commitZoom)(pendingHeight.value);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commitZoom]
  );

  const [date, setDate] = useState(new Date());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  const start = useMemo(() => dayjs(date).subtract(1, 'month').toDate(), [date]);
  const end = useMemo(() => dayjs(date).add(1, 'month').toDate(), [date]);

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: loadAccounts });
  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;

  const queryClient = useQueryClient();
  const { data: calendars = [], isLoading: calsLoading, isFetching: calsFetching } = useCalendars(activeAccount);
  const visibleCalendars = calendars.filter((c) => !hiddenCalendarIds.includes(c.id));

  const prevCtagsRef = useRef<string>('');
  useEffect(() => {
    const current = calendars.map((c) => c.ctag).join(',');
    if (prevCtagsRef.current && prevCtagsRef.current !== current) {
      queryClient.invalidateQueries({ queryKey: [activeAccountId, 'events'] });
    }
    prevCtagsRef.current = current;
  }, [calendars, activeAccountId, queryClient]);

  const { data: allEvents = [], isLoading: eventsLoading, isFetching: eventsFetching } = useQuery<CalendarEvent[]>({
    queryKey: [activeAccountId, 'events', visibleCalendars.map((c) => c.id), start.toISOString(), end.toISOString()],
    queryFn: async () => {
      if (!activeAccount || visibleCalendars.length === 0) return [];
      const results = await Promise.all(
        visibleCalendars.map((cal) => fetchEvents(activeAccount, cal, start, end))
      );
      return results.flat();
    },
    enabled: activeAccount !== null && visibleCalendars.length > 0,
    staleTime: Infinity,
  });

  const hadEventsRef = useRef(false);
  useEffect(() => {
    if (allEvents.length > 0) hadEventsRef.current = true;
  }, [allEvents]);
  useEffect(() => { hadEventsRef.current = false; }, [activeAccountId]);

  const showFullOverlay = !hadEventsRef.current && eventsLoading && allEvents.length === 0;
  const showSmallLoader = (eventsFetching || calsFetching) && !showFullOverlay;

  function openDrawer() {
    setDrawerOpen(true);
    Animated.timing(drawerAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
  }

  function closeDrawer() {
    Animated.timing(drawerAnim, { toValue: -DRAWER_WIDTH, duration: 200, useNativeDriver: true }).start(
      () => setDrawerOpen(false)
    );
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
    const textColor = getContrastColor(color);
    const subTextColor = textColor === '#ffffff' ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.7)';
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
          <Text style={{ fontSize: titleSize, color: textColor, fontWeight: '600' }} numberOfLines={1}>
            {event.title}
          </Text>
        ) : (
          <>
            <Text style={{ fontSize: titleSize, color: textColor, fontWeight: '600' }} numberOfLines={2}>
              {event.title}
            </Text>
            <Text style={{ fontSize: timeSize, color: subTextColor }} numberOfLines={1}>
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

  const handlePressCell = useCallback(
    (d: Date) => { router.push({ pathname: '/event/new', params: { date: d.toISOString() } }); },
    [router]
  );

  const isToday = dayjs(date).isSame(dayjs(), 'day');

  // Header title: current month + year, plus week number for time-grid modes
  const headerTitle = useMemo(() => {
    const d = dayjs(date);
    const monthYear = d.format('MMMM YYYY');
    if (viewMode === 'week' || viewMode === '3days' || viewMode === 'day') {
      return `${monthYear}  ·  W${d.isoWeek()}`;
    }
    return monthYear;
  }, [date, viewMode]);

  const headerHeight = 44 + 40 + insets.top;
  const calHeight = windowHeight - headerHeight - insets.bottom - 49;

  // Force remount on theme change so internal library styles refresh
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
            onPress={() => setDate(new Date())}
            disabled={isToday}
          >
            <Text style={[styles.todayBtnText, { color: theme.primary }]}>Today</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modePills}>
          {VIEW_MODES.map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[
                styles.modeBtn,
                { backgroundColor: theme.chip },
                viewMode === mode && { backgroundColor: theme.chipActive },
              ]}
              onPress={() => setViewMode(mode)}
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
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>

      <GestureDetector gesture={pinchGesture}>
      <View style={styles.calendarWrapper}>
        <Calendar
          key={calendarKeyFull}
          events={calendarEvents}
          mode={viewMode}
          date={date}
          height={calHeight}
          hourRowHeight={hourRowHeight}
          timeslots={1}
          weekStartsOn={weekStartsOn}
          weekEndsOn={((weekStartsOn + 6) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6}
          onPressEvent={handlePressEvent}
          onPressCell={handlePressCell}
          onSwipeEnd={setDate}
          scrollOffsetMinutes={scrollOffset}
          renderHeader={FixedCalendarHeader}
          renderEvent={renderEvent}
          theme={{
            palette: {
              primary: { main: theme.primary },
              gray: {
                '100': theme.borderSubtle,
                '200': theme.border,
                '500': theme.textSecondary,
                '800': theme.text,
              },
            },
          }}
        />
      </View>
      </GestureDetector>

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
        <Text style={[styles.fabIcon, { color: getContrastColor(theme.primary) }]}>+</Text>
      </TouchableOpacity>

      {drawerOpen && (
        <CalendarDrawer
          open={drawerOpen}
          drawerAnim={drawerAnim}
          insets={insets}
          activeAccount={activeAccount}
          calendars={calendars}
          hiddenCalendarIds={hiddenCalendarIds}
          toggleCalendarVisibility={toggleCalendarVisibility}
          onClose={closeDrawer}
          onNavigateSettings={() => { closeDrawer(); router.push('/(tabs)/settings'); }}
        />
      )}
    </View>
  );
}


