import { memo, useRef, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import {
  View, Text, SectionList, TouchableOpacity, StyleSheet,
} from 'react-native';
import dayjs from 'dayjs';
import { useTheme } from '@/hooks/useTheme';
import type { Theme } from '@/theme';
import type { CalendarEvent } from '@/types';

interface Props {
  events: CalendarEvent[];
  date: Date;
  onPressEvent: (event: CalendarEvent) => void;
  onPressCell: (date: Date) => void;
  onVisibleDateChange?: (date: Date) => void;
}

const DAYS_AHEAD = 120;

type AgendaSection = { key: string; date: Date; data: CalendarEvent[] };

function formatTime(d: Date, allDay: boolean): string {
  if (allDay) return 'All day';
  return dayjs(d).format('HH:mm');
}

interface DayHeaderProps {
  sectionDate: Date;
  hasEvents: boolean;
  theme: Theme;
  onPress: (d: Date) => void;
}

const DayHeader = memo(({ sectionDate, hasEvents, theme, onPress }: DayHeaderProps) => {
  const d = dayjs(sectionDate);
  const isToday = d.isSame(dayjs(), 'day');
  return (
    <TouchableOpacity
      onPress={() => onPress(sectionDate)}
      style={[styles.dayHeader, { backgroundColor: theme.background, borderBottomColor: theme.borderSubtle }]}
      activeOpacity={0.7}
    >
      <View style={[styles.dayBadge, isToday && { backgroundColor: theme.primary }]}>
        <Text style={[styles.dayNum, { color: isToday ? theme.primaryText : theme.text }]}>
          {d.format('D')}
        </Text>
      </View>
      <View>
        <Text style={[styles.dayName, { color: isToday ? theme.primary : theme.textSecondary }]}>
          {d.format('ddd').toUpperCase()}
        </Text>
        {isToday && <Text style={[styles.todayLabel, { color: theme.primary }]}>Today</Text>}
      </View>
      {!hasEvents && (
        <Text style={[styles.noEvents, { color: theme.textTertiary }]}>No events</Text>
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
  const duration = event.allDay
    ? null
    : (() => {
        const mins = dayjs(event.dtend).diff(dayjs(event.dtstart), 'minute');
        if (mins < 60) return `${mins}m`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m ? `${h}h ${m}m` : `${h}h`;
      })();

  return (
    <TouchableOpacity
      style={[styles.eventRow, { backgroundColor: theme.surface }]}
      onPress={() => onPress(event)}
      activeOpacity={0.75}
    >
      <View style={[styles.colorBar, { backgroundColor: event.color }]} />
      <View style={styles.eventContent}>
        <Text style={[styles.eventTitle, { color: theme.text }]} numberOfLines={2}>
          {event.summary || '(No title)'}
        </Text>
        <View style={styles.eventMeta}>
          <Text style={[styles.eventTime, { color: theme.textSecondary }]}>
            {formatTime(event.dtstart, event.allDay)}
            {!event.allDay && ` – ${formatTime(event.dtend, false)}`}
          </Text>
          {duration && (
            <Text style={[styles.eventDuration, { color: theme.textTertiary }]}>{duration}</Text>
          )}
          {event.location ? (
            <Text style={[styles.eventLocation, { color: theme.textTertiary }]} numberOfLines={1}>
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


const AgendaViewImpl = forwardRef<AgendaViewHandle, Props>(function AgendaView(
  { events, date, onPressEvent, onPressCell, onVisibleDateChange }, ref
) {
  const theme = useTheme();
  const listRef = useRef<SectionList<CalendarEvent, AgendaSection>>(null);

  const sections = useMemo(() => {
    const today = dayjs();
    const start = today.startOf('day');
    const end = today.add(DAYS_AHEAD, 'day').endOf('day');

    const byDay = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const eStart = dayjs(e.dtstart);
      const eEnd = dayjs(e.dtend);
      let cur = eStart.startOf('day');
      while (cur.isBefore(eEnd) || cur.isSame(eEnd, 'day')) {
        if (cur.isAfter(end)) break;
        if (!cur.isBefore(start)) {
          const key = cur.format('YYYY-MM-DD');
          if (!byDay.has(key)) byDay.set(key, []);
          byDay.get(key)!.push(e);
        }
        cur = cur.add(1, 'day');
      }
    }

    const result: AgendaSection[] = [];
    let cur = start.clone();
    while (cur.isBefore(end)) {
      const key = cur.format('YYYY-MM-DD');
      result.push({
        key,
        date: cur.toDate(),
        data: (byDay.get(key) ?? []).sort((a, b) => {
          if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
          return a.dtstart.getTime() - b.dtstart.getTime();
        }),
      });
      cur = cur.add(1, 'day');
    }
    return result;
  }, [events]);

  useImperativeHandle(ref, () => ({
    scrollToToday: () => {
      listRef.current?.scrollToLocation({ sectionIndex: 0, itemIndex: 0, viewOffset: 0, animated: true });
    },
  }));

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 });
  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (!onVisibleDateChange || viewableItems.length === 0) return;
    const first = viewableItems[0];
    const d: Date | undefined = first?.section?.date ?? first?.item?.dtstart;
    if (d) onVisibleDateChange(d);
  }, [onVisibleDateChange]);

  const renderSectionHeader = useCallback(({ section }: { section: typeof sections[0] }) => (
    <DayHeader
      sectionDate={section.date}
      hasEvents={section.data.length > 0}
      theme={theme}
      onPress={onPressCell}
    />
  ), [theme, onPressCell]);

  const renderItem = useCallback(({ item }: { item: CalendarEvent }) => (
    <EventRow event={item} theme={theme} onPress={onPressEvent} />
  ), [theme, onPressEvent]);

  const keyExtractor = useCallback((item: CalendarEvent, index: number) => `${item.uid}-${index}`, []);

  return (
    <SectionList<CalendarEvent, AgendaSection>
      ref={listRef}
      sections={sections}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      stickySectionHeadersEnabled
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      updateCellsBatchingPeriod={50}
      windowSize={7}
      removeClippedSubviews
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ paddingBottom: 80 }}
      onScrollToIndexFailed={() => {}}
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
