import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { useRouter, useTheme } from 'expo-router';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { useCalendarStore } from '@/stores/calendarStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { ViewContainer, Spinner } from '@/ui/components';
import { CalendarDrawer } from '@/features/calendar/components/CalendarDrawer';
import { OfflineBanner } from '@/features/calendar/components/OfflineBanner';
import { MonthDayView } from '@/features/calendar/components/MonthDayView';
import { AgendaView } from '@/features/calendar/components/AgendaView';
import { computeOverlapMap } from '@/features/calendar/utils/overlapMap';
import { createNavigationGuard } from '@/utils/navigationGuard';
import type { CalendarEvent } from '@/types';
import { useCalendarNavigation } from '@/features/calendar/hooks/useCalendarNavigation';
import { useCalendarData } from '@/features/calendar/hooks/useCalendarData';
import { useCalendarLayout } from '@/features/calendar/hooks/useCalendarLayout';
import { useCalendarDrawer } from '@/features/calendar/hooks/useCalendarDrawer';
import { useZoom } from '@/features/calendar/hooks/useZoom';
import { CalendarTopBar } from '@/features/calendar/components/CalendarTopBar';
import { TimeGridView } from '@/features/calendar/components/TimeGridView';
import { TimeGridEvent } from '@/features/calendar/components/TimeGridEvent';
import { ViewLayer } from '@/features/calendar/components/ViewLayer';
import { CalendarFab } from '@/features/calendar/components/CalendarFab';
import { CalendarLoadingOverlay } from '@/features/calendar/components/CalendarLoadingOverlay';
import { toBigCalendarEvents } from '@/features/calendar/utils/toCalendarEvents';
import { isCalMode } from '@/features/calendar/constants';

dayjs.extend(isoWeek);

export default function CalendarScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useTranslation();

  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const language = useSettingsStore((s) => s.language);
  const hiddenCalendarIds = useCalendarStore((s) => s.hiddenCalendarIds);
  const toggleCalendarVisibility = useCalendarStore((s) => s.toggleCalendarVisibility);

  const nav = useCalendarNavigation();
  const { viewMode, date, fetchDate, agendaVisibleDate, navigateMonth, goToday } = nav;

  const deferredViewMode = useDeferredValue(viewMode);
  const deferredCalDates = useDeferredValue(nav.calDates);
  const deferredDate = useDeferredValue(date);
  const deferredWeekStartsOn = useDeferredValue(weekStartsOn);
  const deferredIsCalendarMode = isCalMode(deferredViewMode);

  const [todayPending, setTodayPending] = useState(false);
  const handleToday = useCallback(() => {
    setTodayPending(true);
    goToday();
  }, [goToday]);
  useEffect(() => {
    if (todayPending && date === deferredDate && nav.calDates === deferredCalDates) {
      setTodayPending(false);
    }
  }, [todayPending, date, deferredDate, nav.calDates, deferredCalDates]);

  const { hourRowHeight, calendarKey, pinchGesture } = useZoom();
  const { activeAccount, calendars, allEvents, showFullOverlay, showSmallLoader } = useCalendarData(fetchDate);
  const { insets, onViewAreaLayout, heightFor, scrollOffset } = useCalendarLayout(allEvents, deferredWeekStartsOn, hourRowHeight);
  const drawer = useCalendarDrawer();

  const overlapMap = useMemo(() => computeOverlapMap(allEvents), [allEvents]);
  const calendarEvents = useMemo(() => toBigCalendarEvents(allEvents, overlapMap), [allEvents, overlapMap]);

  const navGuard = useRef(createNavigationGuard()).current;

  const handlePressEvent = useCallback(
    (event: any) => { navGuard(() => router.push(`/event/${event._event.uid}`)); },
    [router, navGuard]
  );
  const handlePressEventFromMonth = useCallback(
    (event: CalendarEvent) => { navGuard(() => router.push(`/event/${event.uid}`)); },
    [router, navGuard]
  );
  const handlePressCell = useCallback(
    (d: Date) => { navGuard(() => router.push({ pathname: '/event/new', params: { date: d.toISOString() } })); },
    [router, navGuard]
  );

  const monthSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-30, 30])
        .failOffsetY([-15, 15])
        .onEnd((e) => {
          if (e.translationX < -50) scheduleOnRN(navigateMonth, 1);
          else if (e.translationX > 50) scheduleOnRN(navigateMonth, -1);
        }),
    [navigateMonth]
  );

  const renderEvent = useCallback((event: any, touchableOpacityProps: any) => {
    const { key, ...touchableProps } = touchableOpacityProps;
    return (
      <TimeGridEvent
        key={key}
        event={event}
        touchableProps={touchableProps}
        hourRowHeight={hourRowHeight}
        primaryColor={theme.colors.primary}
      />
    );
  }, [hourRowHeight, theme.colors.primary]);

  const eventCellStyle = useCallback(
    (event: any) => ({ backgroundColor: (event.color as string) || theme.colors.primary }),
    [theme.colors.primary]
  );

  const bigCalendarTheme = useMemo(
    () => ({
      palette: {
        primary: { main: theme.colors.primary },
        gray: {
          '100': theme.colors.borderSubtle,
          '200': theme.colors.border,
          '500': theme.colors.textSecondary,
          '800': theme.colors.text,
        },
      },
      // Larger hour-guide / time labels for a more readable week view.
      typography: {
        xs: { fontSize: 12, lineHeight: 15 },
        sm: { fontSize: 13, lineHeight: 17 },
      },
    }),
    [theme.colors.primary, theme.colors.borderSubtle, theme.colors.border, theme.colors.textSecondary, theme.colors.text]
  );

  const isToday = viewMode === 'schedule'
    ? dayjs(agendaVisibleDate).isSame(dayjs(), 'day')
    : dayjs(date).isSame(dayjs(), 'day');

  const headerTitle = useMemo(() => {
    const d = dayjs(viewMode === 'schedule' ? agendaVisibleDate : date);
    const monthYear = d.locale(language).format('MMMM YYYY');
    if (viewMode === 'week' || viewMode === '3days' || viewMode === 'day') {
      return `${monthYear}  ·  ${t('calendar.weekAbbr')}${d.isoWeek()}`;
    }
    return monthYear;
  }, [date, agendaVisibleDate, viewMode, language, t]);


  const calendarKeyFull = String(calendarKey);

  return (
    <ViewContainer>
      <CalendarTopBar
        headerTitle={headerTitle}
        isToday={isToday}
        todayLoading={todayPending}
        viewMode={viewMode}
        onOpenDrawer={drawer.openDrawer}
        onToday={handleToday}
        onSwitchMode={nav.switchMode}
      />

      <OfflineBanner />

      <View style={styles.viewArea} onLayout={onViewAreaLayout}>
        <ViewLayer visible={deferredViewMode === 'month'}>
          <GestureDetector gesture={monthSwipeGesture}>
            <View style={styles.fill}>
              <MonthDayView
                date={deferredDate}
                events={allEvents}
                weekStartsOn={deferredWeekStartsOn}
                onSelectDate={nav.setDate}
                onPressEvent={handlePressEventFromMonth}
                onPressCell={handlePressCell}
              />
            </View>
          </GestureDetector>
        </ViewLayer>

        <ViewLayer visible={deferredViewMode === 'schedule'}>
          <AgendaView
            ref={nav.agendaRef}
            events={allEvents}
            date={date}
            onPressEvent={handlePressEventFromMonth}
            onPressCell={handlePressCell}
            onVisibleDateChange={nav.setAgendaVisibleDate}
          />
        </ViewLayer>

        <ViewLayer visible={deferredIsCalendarMode}>
          <TimeGridView
            pinchGesture={pinchGesture}
            mountedCalModes={nav.mountedCalModes}
            viewMode={deferredViewMode}
            calendarKey={calendarKeyFull}
            events={calendarEvents}
            calDates={deferredCalDates}
            heightFor={heightFor}
            hourRowHeight={hourRowHeight}
            weekStartsOn={deferredWeekStartsOn}
            scrollOffset={scrollOffset}
            onPressEvent={handlePressEvent}
            onPressCell={handlePressCell}
            onSwipeEndHandlers={nav.onSwipeEndHandlers}
            renderEvent={renderEvent}
            eventCellStyle={eventCellStyle}
            bigCalendarTheme={bigCalendarTheme}
          />
        </ViewLayer>
      </View>

      {showFullOverlay && <CalendarLoadingOverlay label={t('calendar.loadingCalendar')} />}
      {showSmallLoader && <Spinner size="small" color="secondary" style={styles.smallLoader} />}

      <CalendarFab onPress={() => navGuard(() => router.push('/event/new'))} />

      <CalendarDrawer
        open={drawer.drawerOpen}
        drawerAnim={drawer.drawerAnim}
        overlayAnim={drawer.overlayAnim}
        insets={insets}
        activeAccount={activeAccount}
        calendars={calendars}
        hiddenCalendarIds={hiddenCalendarIds}
        toggleCalendarVisibility={toggleCalendarVisibility}
        onClose={drawer.closeDrawer}
        onNavigateSettings={() => { drawer.closeDrawer(); router.push('/(tabs)/settings'); }}
      />
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  viewArea: { flex: 1 },
  fill: { flex: 1 },
  smallLoader: { position: 'absolute', bottom: 24, left: 16, zIndex: 5 },
});
