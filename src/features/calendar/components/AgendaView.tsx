import { memo, useRef, useCallback, useMemo, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, type ViewToken,
} from 'react-native';
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import type { Theme } from '@/theme';
import type { CalendarEvent } from '@/types';
import { buildAgendaSections } from '../utils/agendaSections';

dayjs.extend(localizedFormat);

interface Props {
  events: CalendarEvent[];
  date: Date;
  onPressEvent: (event: CalendarEvent) => void;
  onPressCell: (date: Date) => void;
  onVisibleDateChange?: (date: Date) => void;
}

const GROW_PAST_DAYS = 14;
const FUTURE_DAYS_INITIAL = 120;
const GROW_FUTURE_DAYS = 60;
const GROW_THROTTLE_MS = 300;
const SCROLL_RETRY_MS = 200;
const SCROLL_MAX_ATTEMPTS = 60;
const SNAP_HOP_ROWS = 60;
const REVEAL_TIMEOUT_MS = 800;

function formatTime(d: Date, allDay: boolean, allDayLabel: string): string {
  if (allDay) return allDayLabel;
  return dayjs(d).format('LT');
}

interface DayHeaderProps {
  sectionDate: Date;
  hasEvents: boolean;
  theme: Theme;
  onPress: (d: Date) => void;
}

const DayHeader = memo(({ sectionDate, hasEvents, theme, onPress }: DayHeaderProps) => {
  const { t } = useTranslation();
  const d = dayjs(sectionDate);
  const isToday = d.isSame(dayjs(), 'day');
  return (
    <TouchableOpacity
      onPress={() => onPress(sectionDate)}
      style={[styles.dayHeader, { backgroundColor: theme.colors.background, borderBottomColor: theme.colors.borderSubtle }]}
      activeOpacity={0.7}
    >
      <View style={[styles.dayBadge, isToday && { backgroundColor: theme.colors.primary }]}>
        <Text style={[styles.dayNum, { color: isToday ? theme.colors.primaryText : theme.colors.text }]}>
          {d.format('D')}
        </Text>
      </View>
      <View>
        <Text style={[styles.dayName, { color: isToday ? theme.colors.primary : theme.colors.textSecondary }]}>
          {d.format('ddd').toUpperCase()}
        </Text>
        {isToday && <Text style={[styles.todayLabel, { color: theme.colors.primary }]}>{t('calendar.today')}</Text>}
      </View>
      {!hasEvents && (
        <Text style={[styles.noEvents, { color: theme.colors.textTertiary }]}>{t('calendar.noEvents')}</Text>
      )}
    </TouchableOpacity>
  );
});

interface EventRowProps {
  event: CalendarEvent;
  theme: Theme;
  onPress: (e: CalendarEvent) => void;
}

const EventRow = memo(({ event, theme, onPress }: EventRowProps) => {
  const { t } = useTranslation();
  const duration = event.allDay
    ? null
    : (() => {
        const mins = dayjs(event.dtend).diff(dayjs(event.dtstart), 'minute');
        if (mins < 60) return `${mins}m`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m ? `${h}h ${m}m` : `${h}h`;
      })();

  const allDayLabel = t('calendar.allDay');

  return (
    <TouchableOpacity
      style={[styles.eventRow, { backgroundColor: theme.colors.surface }]}
      onPress={() => onPress(event)}
      activeOpacity={0.75}
    >
      <View style={[styles.colorBar, { backgroundColor: event.color }]} />
      <View style={styles.eventContent}>
        <Text style={[styles.eventTitle, { color: theme.colors.text }]} numberOfLines={2}>
          {event.summary || t('calendar.noTitle')}
        </Text>
        <View style={styles.eventMeta}>
          <Text style={[styles.eventTime, { color: theme.colors.textSecondary }]}>
            {formatTime(event.dtstart, event.allDay, allDayLabel)}
            {!event.allDay && ` – ${formatTime(event.dtend, false, allDayLabel)}`}
          </Text>
          {duration && (
            <Text style={[styles.eventDuration, { color: theme.colors.textTertiary }]}>{duration}</Text>
          )}
          {event.location ? (
            <Text style={[styles.eventLocation, { color: theme.colors.textTertiary }]} numberOfLines={1}>
              · {event.location}
            </Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
});

export interface AgendaViewHandle {
  scrollToToday: () => void;
}

// The agenda renders as a FlatList of flattened rows (a header row per day,
// then one row per event) with stickyHeaderIndices. This replaces SectionList
// because scrollToLocation / getScrollResponder / maintainVisibleContentPosition
// are unreliable on SectionList with this React Native version, while FlatList
// exposes scrollToIndex and scrollToOffset that actually work.
type Row =
  | { type: 'header'; key: string; date: Date; hasEvents: boolean }
  | { type: 'item'; key: string; event: CalendarEvent };

const AgendaViewImpl = forwardRef<AgendaViewHandle, Props>(function AgendaView(
  { events, onPressEvent, onPressCell, onVisibleDateChange }, ref
) {
  const theme = useTheme();
  const listRef = useRef<FlatList<Row>>(null);

  // The window starts at today and extends into the future; the past is grown
  // lazily in small chunks when the earliest rendered day reaches the top of
  // the viewport, re-anchoring the visible day around the prepend.
  const [pastDays, setPastDays] = useState(0);
  const [futureDays, setFutureDays] = useState(FUTURE_DAYS_INITIAL);
  const [positioned, setPositioned] = useState(false);
  const lastGrowRef = useRef(0);
  const rowsRef = useRef<Row[]>([]);
  const firstVisibleKeyRef = useRef<string | null>(null);
  const snapRef = useRef<{ key: string; attempts: number } | null>(null);
  const lastSnapRef = useRef(0);
  const pastAnchorRef = useRef<string | null>(null);

  const todayKey = dayjs().format('YYYY-MM-DD');

  const sections = useMemo(() => {
    const today = dayjs();
    return buildAgendaSections(
      events,
      today.subtract(pastDays, 'day').toDate(),
      today.add(futureDays, 'day').toDate(),
    );
  }, [events, pastDays, futureDays]);

  const { rows, stickyIndices } = useMemo(() => {
    const out: Row[] = [];
    const sticky: number[] = [];
    for (const s of sections) {
      sticky.push(out.length);
      out.push({ type: 'header', key: s.key, date: s.date, hasEvents: s.data.length > 0 });
      for (const e of s.data) out.push({ type: 'item', key: s.key, event: e });
    }
    return { rows: out, stickyIndices: sticky };
  }, [sections]);
  rowsRef.current = rows;

  // scrollToIndex can't reach rows that were never laid out; homing in on the
  // target day by hopping through nearby rows converges anyway, since each
  // landing lays out a new region.
  const rowIndexOfDay = useCallback((key: string | null): number => {
    if (!key) return -1;
    return rowsRef.current.findIndex((r) => r.type === 'header' && r.key === key);
  }, []);

  const stepTowardSnap = useCallback(() => {
    const snap = snapRef.current;
    if (!snap || snap.attempts >= SCROLL_MAX_ATTEMPTS) return;
    const targetIdx = rowIndexOfDay(snap.key);
    if (targetIdx < 0) {
      snapRef.current = null;
      return;
    }
    const from = rowIndexOfDay(firstVisibleKeyRef.current);
    if (from === targetIdx) {
      snapRef.current = null;
      return;
    }
    const delta = targetIdx - Math.max(0, from);
    const hop = Math.abs(delta) > SNAP_HOP_ROWS ? Math.sign(delta) * SNAP_HOP_ROWS : delta;
    snap.attempts += 1;
    lastSnapRef.current = Date.now();
    listRef.current?.scrollToIndex({
      index: Math.max(0, Math.min(rowsRef.current.length - 1, Math.max(0, from) + hop)),
      viewOffset: 0,
      viewPosition: 0,
      animated: false,
    });
  }, [rowIndexOfDay]);

  const requestSnap = useCallback((key: string, animated: boolean) => {
    snapRef.current = { key, attempts: 0 };
    const idx = rowIndexOfDay(key);
    if (idx < 0) return;
    // The row indices may have just shifted (prepend) or not be laid out yet:
    // forget the last known position so the next viewability update
    // re-evaluates where the viewport really is.
    firstVisibleKeyRef.current = null;
    lastSnapRef.current = Date.now();
    listRef.current?.scrollToIndex({ index: idx, viewOffset: 0, viewPosition: 0, animated });
  }, [rowIndexOfDay]);

  useImperativeHandle(ref, () => ({
    scrollToToday: () => requestSnap(todayKey, true),
  }), [requestSnap, todayKey]);

  const onScrollToIndexFailed = useCallback(
    (info: { index: number; highestMeasuredFrameIndex: number; averageItemLength: number }) => {
      if (!snapRef.current) return;
      // The target row wasn't laid out: jump to its estimated offset so the
      // region gets rendered, then the snap machinery homes in precisely.
      listRef.current?.scrollToOffset({
        offset: info.averageItemLength * info.index,
        animated: false,
      });
      setTimeout(stepTowardSnap, SCROLL_RETRY_MS);
    },
    [stepTowardSnap],
  );

  // After a past growth, scroll back to the day that was on top so the prepend
  // doesn't yank the viewport to the new earliest day. The snap machinery
  // keeps homing in on the anchor if this scroll missed.
  useEffect(() => {
    const anchor = pastAnchorRef.current;
    if (!anchor) return;
    pastAnchorRef.current = null;
    const idx = rowIndexOfDay(anchor);
    if (idx < 0) return;
    snapRef.current = { key: anchor, attempts: 0 };
    firstVisibleKeyRef.current = null;
    lastSnapRef.current = Date.now();
    const t = setTimeout(() => {
      listRef.current?.scrollToIndex({ index: idx, viewOffset: 0, viewPosition: 0, animated: false });
    }, 0);
    return () => clearTimeout(t);
  }, [rows, rowIndexOfDay]);

  // Reveal fallback in case viewability never reports today.
  useEffect(() => {
    const t = setTimeout(() => setPositioned(true), REVEAL_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  const growFuture = useCallback(() => {
    const now = Date.now();
    if (now - lastGrowRef.current < GROW_THROTTLE_MS) return;
    lastGrowRef.current = now;
    setFutureDays((d) => d + GROW_FUTURE_DAYS);
  }, []);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 });
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length === 0) return;
    const first = viewableItems[0];
    const row = first?.item as Row | undefined;
    if (!row) return;
    const key = row.key;
    const d: Date = row.type === 'header' ? row.date : row.event.dtstart;
    firstVisibleKeyRef.current = key;
    if (!positioned && key === todayKey) setPositioned(true);
    const snap = snapRef.current;
    if (snap) {
      if (key === snap.key) snapRef.current = null;
      else if (Date.now() - lastSnapRef.current >= GROW_THROTTLE_MS) stepTowardSnap();
    } else if (positioned && key === rowsRef.current[0]?.key) {
      // The earliest rendered day is on screen: extend the window backwards.
      const now = Date.now();
      if (now - lastGrowRef.current >= GROW_THROTTLE_MS) {
        lastGrowRef.current = now;
        pastAnchorRef.current = key;
        setPastDays((days) => days + GROW_PAST_DAYS);
      }
    }
    // While a programmatic snap is in flight (re-anchor after a prepend, or
    // scrollToToday), intermediate positions are transient — don't push them
    // to the navigation/fetch date.
    if (!snapRef.current) onVisibleDateChange?.(d);
  }, [onVisibleDateChange, positioned, todayKey, stepTowardSnap]);

  const renderRow = useCallback(({ item }: { item: Row }) => (
    item.type === 'header'
      ? <DayHeader sectionDate={item.date} hasEvents={item.hasEvents} theme={theme} onPress={onPressCell} />
      : <EventRow event={item.event} theme={theme} onPress={onPressEvent} />
  ), [theme, onPressCell, onPressEvent]);

  const keyExtractor = useCallback((item: Row, index: number) => (
    item.type === 'header' ? `h-${item.key}` : `i-${item.key}-${item.event.uid}-${index}`
  ), []);

  return (
    <FlatList<Row>
      ref={listRef}
      data={rows}
      keyExtractor={keyExtractor}
      renderItem={renderRow}
      stickyHeaderIndices={stickyIndices}
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      initialNumToRender={12}
      maxToRenderPerBatch={16}
      updateCellsBatchingPeriod={40}
      windowSize={9}
      removeClippedSubviews
      style={{ flex: 1, backgroundColor: theme.colors.background, opacity: positioned ? 1 : 0 }}
      contentContainerStyle={{ paddingBottom: 80 }}
      onScrollToIndexFailed={onScrollToIndexFailed}
      onEndReached={growFuture}
      onScrollBeginDrag={() => { snapRef.current = null; }}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig.current}
    />
  );
});

export const AgendaView = memo(AgendaViewImpl);

const EVENT_ROW_HEIGHT = 72;

const styles = StyleSheet.create({
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  dayBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNum: { fontSize: 16, fontWeight: '700' },
  dayName: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  todayLabel: { fontSize: 10, fontWeight: '500', marginTop: 1 },
  noEvents: { fontSize: 13, marginLeft: 4, fontStyle: 'italic' },
  eventRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
    minHeight: EVENT_ROW_HEIGHT - 6,
  },
  colorBar: { width: 4 },
  eventContent: { flex: 1, padding: 10, justifyContent: 'center' },
  eventTitle: { fontSize: 14, fontWeight: '600', marginBottom: 3 },
  eventMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  eventTime: { fontSize: 12, fontWeight: '500' },
  eventDuration: { fontSize: 11 },
  eventLocation: { fontSize: 11, flex: 1 },
});
