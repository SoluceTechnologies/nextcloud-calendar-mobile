import { useCallback, useDeferredValue, useMemo, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { useAccountStore } from '@/stores/accountStore';
import { useCalendarStore } from '@/stores/calendarStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { ViewContainer, Spinner } from '@/ui/components';
import { CalendarDrawer } from '@/features/calendar/components/CalendarDrawer';
import { OfflineBanner } from '@/features/calendar/components/OfflineBanner';
import { MonthDayView } from '@/features/calendar/components/MonthDayView';
import { AgendaView } from '@/features/calendar/components/AgendaView';
import { createNavigationGuard } from '@/utils/navigationGuard';
import type { CalendarEvent, RecurrenceEditScope } from '@/types';
import { useCalendarNavigation } from '@/features/calendar/hooks/useCalendarNavigation';
import { useCalendarData } from '@/features/calendar/hooks/useCalendarData';
import { useCalendarDrawer } from '@/features/calendar/hooks/useCalendarDrawer';
import { useZoom } from '@/features/calendar/hooks/useZoom';
import { CalendarTopBar } from '@/features/calendar/components/CalendarTopBar';
import { TimeGridView } from '@/features/calendar/components/TimeGridView';
import { ViewLayer } from '@/features/calendar/components/ViewLayer';
import { CalendarFab } from '@/features/calendar/components/CalendarFab';
import { CalendarLoadingOverlay } from '@/features/calendar/components/CalendarLoadingOverlay';
import { toGridEvents, type GridEvent } from '@/features/calendar/utils/toGridEvents';
import { eventToInput } from '@/features/calendar/utils/eventToInput';
import { decideMoveEventScope } from '@/features/calendar/utils/moveEventScope';
import { isCalMode, type CalMode } from '@/features/calendar/constants';
import { CalendarUnavailable } from '@/features/calendar/components/CalendarUnavailable';
import { useInvitations } from '@/features/invitations/hooks/useInvitations';
import { useUpdateEvent } from '@/features/event/hooks/useMutateEvent';
import { askRecurrenceScope } from '@/features/event/recurrenceScope';

dayjs.extend(isoWeek);

export default function CalendarScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const calendarApp = useAccountStore((s) => s.capabilities.calendarApp);
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const language = useSettingsStore((s) => s.language);
  const hiddenCalendarIds = useCalendarStore((s) => s.hiddenCalendarIds);
  const toggleCalendarVisibility = useCalendarStore((s) => s.toggleCalendarVisibility);
  const notifDisabledCalendarIds = useCalendarStore((s) => s.notifDisabledCalendarIds);
  const toggleCalendarNotifications = useCalendarStore((s) => s.toggleCalendarNotifications);

  const nav = useCalendarNavigation();
  const { viewMode, date, fetchDate, agendaVisibleDate } = nav;

  const deferredViewMode = useDeferredValue(viewMode);
  const deferredDate = useDeferredValue(date);
  const deferredAnchorDate = useDeferredValue(nav.anchorDate);
  const deferredWeekStartsOn = useDeferredValue(weekStartsOn);
  const deferredIsCalendarMode = isCalMode(deferredViewMode);
  const lastCalModeRef = useRef<CalMode>('week');
  if (isCalMode(deferredViewMode)) lastCalModeRef.current = deferredViewMode;
  const calMode: CalMode = lastCalModeRef.current;

  const { hourRowHeight, cellHeight, commitZoom } = useZoom();
  const { activeAccount, calendars, allEvents, showFullOverlay, showSmallLoader } = useCalendarData(fetchDate);
  const { data: invitations } = useInvitations(activeAccount);
  const pendingInvitationsCount = invitations.length;
  const insets = useSafeAreaInsets();
  const drawer = useCalendarDrawer();

  const calendarEvents = useMemo(() => toGridEvents(allEvents, activeAccount), [allEvents, activeAccount]);

  const allDayEvents = useMemo(() => allEvents.filter((e) => e.allDay), [allEvents]);
  const nowHour = useMemo(() => Math.max(0, new Date().getHours() - 1), []);

  const navGuard = useRef(createNavigationGuard()).current;

  const handlePressGridEvent = useCallback(
    (event: { _event: CalendarEvent }) => {
      navGuard(() => router.push(`/event/${encodeURIComponent(event._event.uid)}`));
    },
    [router, navGuard]
  );
  const handlePressEventFromMonth = useCallback(
    (event: CalendarEvent) => { navGuard(() => router.push(`/event/${encodeURIComponent(event.uid)}`)); },
    [router, navGuard]
  );
  const handlePressCell = useCallback(
    (d: Date) => { navGuard(() => router.push({ pathname: '/event/new', params: { date: d.toISOString() } })); },
    [router, navGuard]
  );

  const updateMutation = useUpdateEvent(activeAccount!, calendars);
  const { mutateAsync } = updateMutation;

  const recurrenceScopeStrings = useMemo(
    () => ({
      message: t('event.recurrenceScopeMessage'),
      thisOnly: t('event.scopeThisOnly'),
      thisAndFollowing: t('event.scopeThisAndFollowingBtn'),
      all: t('event.scopeAllEvents'),
      cancel: t('common.cancel'),
    }),
    [t]
  );

  const handleMoveEvent = useCallback(
    (gridEvent: GridEvent, nextStart: Date, nextEnd: Date) => {
      if (!activeAccount) return;
      const event = gridEvent._event;
      const apply = (scope: RecurrenceEditScope) => {
        void mutateAsync({
          event,
          input: { ...eventToInput(event, activeAccount), dtstart: nextStart, dtend: nextEnd },
          scope,
          datesOnly: true,
        });
      };
      const decision = decideMoveEventScope(event);
      if (decision.kind === 'prompt') {
        askRecurrenceScope(t('event.editEvent'), recurrenceScopeStrings, apply);
        return;
      }
      apply(decision.scope);
    },
    [activeAccount, mutateAsync, t, recurrenceScopeStrings]
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

  if (calendarApp === 'unconfigured') {
    return <CalendarUnavailable />;
  }

  return (
    <ViewContainer>
      <CalendarTopBar
        headerTitle={headerTitle}
        isToday={isToday}
        viewMode={viewMode}
        pendingInvitationsCount={pendingInvitationsCount}
        onOpenDrawer={drawer.openDrawer}
        onToday={nav.goToday}
        onSwitchMode={nav.switchMode}
      />

      <OfflineBanner />

      <View style={styles.viewArea}>
        <ViewLayer visible={deferredViewMode === 'month'}>
          <MonthDayView
            date={deferredDate}
            events={allEvents}
            weekStartsOn={deferredWeekStartsOn}
            jump={nav.jump}
            onSelectDate={nav.setDate}
            onMonthChange={nav.onPageChange}
            onPressEvent={handlePressEventFromMonth}
            onPressCell={handlePressCell}
          />
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
            mode={calMode}
            anchorDate={deferredAnchorDate}
            activeDate={deferredDate}
            events={calendarEvents}
            allDayEvents={allDayEvents}
            hourRowHeight={hourRowHeight}
            cellHeight={cellHeight}
            weekStartsOn={deferredWeekStartsOn}
            jump={nav.jump}
            commitZoom={commitZoom}
            initialScrollHour={nowHour}
            onPageChange={nav.onPageChange}
            onPressSlot={handlePressCell}
            onPressEvent={handlePressGridEvent}
            onPressAllDayEvent={handlePressEventFromMonth}
            onMoveEvent={handleMoveEvent}
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
        drawerWidth={drawer.drawerWidth}
        insets={insets}
        activeAccount={activeAccount}
        calendars={calendars}
        hiddenCalendarIds={hiddenCalendarIds}
        notifDisabledCalendarIds={notifDisabledCalendarIds}
        pendingInvitationsCount={pendingInvitationsCount}
        toggleCalendarVisibility={toggleCalendarVisibility}
        toggleCalendarNotifications={toggleCalendarNotifications}
        onClose={drawer.closeDrawer}
        onNavigateSettings={() => {
          drawer.closeDrawer();
          router.push('/(tabs)/settings');
        }}
        onNavigateInvitations={() => {
          drawer.closeDrawer();
          router.push('/invitations');
        }}
      />
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  viewArea: { flex: 1 },
  smallLoader: { position: 'absolute', bottom: 24, left: 16, zIndex: 5 },
});
