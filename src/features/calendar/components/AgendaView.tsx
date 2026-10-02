import { memo, useRef, useCallback, useMemo, useLayoutEffect, forwardRef, useImperativeHandle } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, type ViewToken,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import type { Theme } from '@/theme';
import type { CalendarEvent } from '@/types';
import { useTimeFormat } from '@/hooks/useTimeFormat';
import {
  AGENDA_FUTURE_DAYS, AGENDA_PAST_DAYS, agendaRowKey, buildAgendaSections,
} from '../utils/agendaSections';

dayjs.extend(localizedFormat);

interface Props {
  events: CalendarEvent[];
  date: Date;
  onPressEvent: (event: CalendarEvent) => void;
  onPressCell: (date: Date) => void;
  onVisibleDateChange?: (date: Date) => void;
}

const HEADER_HEIGHT = 57;
const EVENT_ROW_HEIGHT = 72;

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
  const { formatTime } = useTimeFormat();
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
        <Text style={[styles.eventTitle, { color: theme.colors.text }]} numberOfLines={1}>
          {event.summary || t('calendar.noTitle')}
        </Text>
        <View style={styles.eventMeta}>
          <Text style={[styles.eventTime, { color: theme.colors.textSecondary }]}>
            {event.allDay ? allDayLabel : formatTime(event.dtstart)}
            {!event.allDay && ` – ${formatTime(event.dtend)}`}
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

type Row =
  | { type: 'header'; key: string; date: Date; hasEvents: boolean }
  | { type: 'item'; key: string; date: Date; event: CalendarEvent };

const AgendaViewImpl = forwardRef<AgendaViewHandle, Props>(function AgendaView(
  { events, onPressEvent, onPressCell, onVisibleDateChange }, ref
) {
  const theme = useTheme();
  const listRef = useRef<FlatList<Row>>(null);
  const todayKey = dayjs().format('YYYY-MM-DD');

  const { rows, stickyIndices, offsets, todayIndex } = useMemo(() => {
    const today = dayjs();
    const sections = buildAgendaSections(
      events,
      today.subtract(AGENDA_PAST_DAYS, 'day').toDate(),
      today.add(AGENDA_FUTURE_DAYS, 'day').toDate(),
    );
    const out: Row[] = [];
    const sticky: number[] = [];
    const offs: number[] = [];
    let y = 0;
    let todayIdx = 0;
    for (const s of sections) {
      if (s.key === todayKey) todayIdx = out.length;
      sticky.push(out.length);
      offs.push(y);
      y += HEADER_HEIGHT;
      out.push({ type: 'header', key: s.key, date: s.date, hasEvents: s.data.length > 0 });
      for (const e of s.data) {
        offs.push(y);
        y += EVENT_ROW_HEIGHT;
        out.push({ type: 'item', key: s.key, date: s.date, event: e });
      }
    }
    return { rows: out, stickyIndices: sticky, offsets: offs, todayIndex: todayIdx };
  }, [events, todayKey]);

  const getItemLayout = useCallback((data: ArrayLike<Row> | null | undefined, index: number) => ({
    length: data?.[index]?.type === 'header' ? HEADER_HEIGHT : EVENT_ROW_HEIGHT,
    offset: offsets[index] ?? 0,
    index,
  }), [offsets]);

  const scrollYRef = useRef(offsets[todayIndex] ?? 0);
  const anchorRef = useRef({ key: todayKey, delta: 0 });
  const layoutRef = useRef({ rows, offsets });
  const userScrollingRef = useRef(false);
  const onUserScrollStart = useCallback(() => { userScrollingRef.current = true; }, []);
  const onUserScrollEnd = useCallback(() => { userScrollingRef.current = false; }, []);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    scrollYRef.current = y;
    if (!userScrollingRef.current) return;
    const { rows: r, offsets: o } = layoutRef.current;
    let i = upperBound(o, y) - 1;
    while (i > 0 && r[i].type !== 'header') i--;
    if (r[i]) anchorRef.current = { key: r[i].key, delta: y - o[i] };
  }, []);

  useLayoutEffect(() => {
    layoutRef.current = { rows, offsets };
    const anchor = anchorRef.current;
    const idx = rows.findIndex((r) => r.type === 'header' && r.key === anchor.key);
    if (idx < 0) return;
    const y = offsets[idx] + anchor.delta;
    if (Math.abs(y - scrollYRef.current) < 1) return;
    scrollYRef.current = y;
    listRef.current?.scrollToOffset({ offset: y, animated: false });
  }, [rows, offsets]);

  const initialIndexRef = useRef(todayIndex);
  const todayRef = useRef({ key: todayKey, y: offsets[todayIndex] ?? 0 });
  todayRef.current = { key: todayKey, y: offsets[todayIndex] ?? 0 };
  useImperativeHandle(ref, () => ({
    scrollToToday: () => {
      const { key, y } = todayRef.current;
      userScrollingRef.current = false;
      anchorRef.current = { key, delta: 0 };
      scrollYRef.current = y;
      listRef.current?.scrollToOffset({ offset: y, animated: false });
    },
  }), []);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 });
  const onVisibleRef = useRef(onVisibleDateChange);
  onVisibleRef.current = onVisibleDateChange;
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const row = viewableItems[0]?.item as Row | undefined;
    if (row) onVisibleRef.current?.(row.date);
  }, []);

  const renderRow = useCallback(({ item }: { item: Row }) => (
    item.type === 'header'
      ? <DayHeader sectionDate={item.date} hasEvents={item.hasEvents} theme={theme} onPress={onPressCell} />
      : <EventRow event={item.event} theme={theme} onPress={onPressEvent} />
  ), [theme, onPressCell, onPressEvent]);

  const keyExtractor = useCallback((item: Row) => (
    item.type === 'header' ? `h-${item.key}` : agendaRowKey(item.key, item.event)
  ), []);

  return (
    <FlatList<Row>
      ref={listRef}
      data={rows}
      keyExtractor={keyExtractor}
      renderItem={renderRow}
      getItemLayout={getItemLayout}
      initialScrollIndex={initialIndexRef.current}
      stickyHeaderIndices={stickyIndices}
      initialNumToRender={20}
      maxToRenderPerBatch={16}
      windowSize={9}
      removeClippedSubviews
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingBottom: 80 }}
      onScroll={onScroll}
      onScrollBeginDrag={onUserScrollStart}
      onScrollEndDrag={onUserScrollEnd}
      onMomentumScrollBegin={onUserScrollStart}
      onMomentumScrollEnd={onUserScrollEnd}
      scrollEventThrottle={32}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig.current}
    />
  );
});

function upperBound(sorted: number[], v: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export const AgendaView = memo(AgendaViewImpl);

const styles = StyleSheet.create({
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    height: HEADER_HEIGHT,
    paddingHorizontal: 16,
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
    height: EVENT_ROW_HEIGHT - 6,
  },
  colorBar: { width: 4 },
  eventContent: { flex: 1, padding: 10, justifyContent: 'center' },
  eventTitle: { fontSize: 14, fontWeight: '600', marginBottom: 3 },
  eventMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  eventTime: { fontSize: 12, fontWeight: '500' },
  eventDuration: { fontSize: 11 },
  eventLocation: { fontSize: 11, flex: 1 },
});
