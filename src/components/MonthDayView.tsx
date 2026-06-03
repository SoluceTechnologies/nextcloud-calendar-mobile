/**
 * iOS-style month view: grid on top, day event list on bottom.
 *
 * Top half: 7-column month grid. Each cell shows the day number and
 * color dots (one per calendar with events that day, up to 3).
 * Bottom half: scrollable list of events for the selected day.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  useWindowDimensions,
} from 'react-native';
import dayjs from 'dayjs';
import { useTheme } from '@/hooks/useTheme';
import { normalizeEvents } from '@/utils/normalizeEvent';
import type { CalendarEvent } from '@/types';

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface Props {
  date: Date;
  events: CalendarEvent[];
  weekStartsOn: 0 | 1;
  onSelectDate: (d: Date) => void;
  onPressEvent: (e: CalendarEvent) => void;
  onPressCell: (d: Date) => void;
}

function buildMonthGrid(year: number, month: number, weekStartsOn: 0 | 1): (dayjs.Dayjs | null)[][] {
  const firstOfMonth = dayjs(new Date(year, month, 1));
  let startCell = firstOfMonth.startOf('week');
  if (weekStartsOn === 1) {
    startCell = firstOfMonth.day() === 0
      ? firstOfMonth.subtract(6, 'day')
      : firstOfMonth.startOf('week').add(1, 'day');
    if (startCell.isAfter(firstOfMonth)) startCell = startCell.subtract(7, 'day');
  }

  const rows: (dayjs.Dayjs | null)[][] = [];
  let cursor = startCell;
  for (let row = 0; row < 6; row++) {
    const week: (dayjs.Dayjs | null)[] = [];
    for (let col = 0; col < 7; col++) {
      week.push(cursor.month() === month ? cursor : null);
      cursor = cursor.add(1, 'day');
    }
    const allNull = week.every((d) => d === null);
    if (allNull) break;
    rows.push(week);
    if (cursor.month() !== month && row >= 3) break;
  }
  return rows;
}

export function MonthDayView({ date, events: rawEvents, weekStartsOn, onSelectDate, onPressEvent, onPressCell }: Props) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const [selectedDay, setSelectedDay] = useState<dayjs.Dayjs>(dayjs(date));
  const events = normalizeEvents(rawEvents);

  const year = dayjs(date).year();
  const month = dayjs(date).month();

  const grid = useMemo(() => buildMonthGrid(year, month, weekStartsOn), [year, month, weekStartsOn]);

  const dotMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const ev of events) {
      if (ev.allDay) continue;
      const key = dayjs(ev.dtstart).format('YYYY-MM-DD');
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(ev.color);
    }
    // Also add all-day events
    for (const ev of events) {
      if (!ev.allDay) continue;
      const key = dayjs(ev.dtstart).format('YYYY-MM-DD');
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(ev.color);
    }
    return map;
  }, [events]);

  const dayEvents = useMemo(() => {
    const sel = selectedDay.format('YYYY-MM-DD');
    return events
      .filter((e) => dayjs(e.dtstart).format('YYYY-MM-DD') === sel)
      .sort((a, b) => a.dtstart.getTime() - b.dtstart.getTime());
  }, [events, selectedDay]);

  const today = dayjs();

  const handleDayPress = useCallback((d: dayjs.Dayjs) => {
    setSelectedDay(d);
    onSelectDate(d.toDate());
  }, [onSelectDate]);

  const dayHeaders = useMemo(() => {
    const headers: string[] = [];
    for (let i = 0; i < 7; i++) {
      headers.push(DAYS_OF_WEEK[(weekStartsOn + i) % 7]);
    }
    return headers;
  }, [weekStartsOn]);

  const gridHeight = height * 0.44;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.grid, { height: gridHeight, borderBottomColor: theme.border }]}>
        <View style={styles.dowRow}>
          {dayHeaders.map((d) => (
            <Text key={d} style={[styles.dowLabel, { color: theme.textTertiary }]}>{d}</Text>
          ))}
        </View>

        {grid.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((d, di) => {
              if (d === null) {
                return <View key={di} style={styles.dayCell} />;
              }
              const key = d.format('YYYY-MM-DD');
              const isToday = d.isSame(today, 'day');
              const isSelected = d.isSame(selectedDay, 'day');
              const dots = Array.from(dotMap.get(key) ?? []).slice(0, 3);

              return (
                <TouchableOpacity
                  key={di}
                  style={styles.dayCell}
                  onPress={() => handleDayPress(d)}
                  onLongPress={() => onPressCell(d.toDate())}
                >
                  <View style={[
                    styles.dayCircle,
                    isSelected && { backgroundColor: theme.primary },
                    isToday && !isSelected && { borderWidth: 1.5, borderColor: theme.primary },
                  ]}>
                    <Text style={[
                      styles.dayNumber,
                      { color: theme.text },
                      isSelected && { color: '#fff' },
                      isToday && !isSelected && { color: theme.primary, fontWeight: '700' },
                    ]}>
                      {d.date()}
                    </Text>
                  </View>
                  <View style={styles.dotsRow}>
                    {dots.map((color, ci) => (
                      <View key={ci} style={[styles.dot, { backgroundColor: color }]} />
                    ))}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.dayList}>
        <Text style={[styles.dayListHeader, { color: theme.textSecondary }]}>
          {selectedDay.format('dddd, MMMM D')}
        </Text>
        {dayEvents.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.textTertiary }]}>No events</Text>
        ) : (
          <FlatList
            data={dayEvents}
            keyExtractor={(e) => `${e.calendarId}-${e.uid}-${e.dtstart.getTime()}`}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.eventRow, { borderLeftColor: item.color, backgroundColor: theme.surface }]}
                onPress={() => onPressEvent(item)}
              >
                <View style={[styles.eventColorBar, { backgroundColor: item.color }]} />
                <View style={styles.eventInfo}>
                  <Text style={[styles.eventTitle, { color: theme.text }]} numberOfLines={1}>
                    {item.summary}
                  </Text>
                  <Text style={[styles.eventTime, { color: theme.textSecondary }]}>
                    {item.allDay
                      ? 'All day'
                      : `${dayjs(item.dtstart).format('h:mm A')} – ${dayjs(item.dtend).format('h:mm A')}`}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingBottom: 16 }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  grid: { borderBottomWidth: StyleSheet.hairlineWidth },
  dowRow: { flexDirection: 'row', paddingVertical: 6 },
  dowLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  weekRow: { flex: 1, flexDirection: 'row' },
  dayCell: { flex: 1, alignItems: 'center', paddingTop: 2 },
  dayCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dayNumber: { fontSize: 14 },
  dotsRow: { flexDirection: 'row', gap: 2, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dayList: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  dayListHeader: { fontSize: 13, fontWeight: '600', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyText: { fontSize: 15, textAlign: 'center', marginTop: 32 },
  eventRow: { flexDirection: 'row', borderRadius: 8, marginBottom: 8, overflow: 'hidden' },
  eventColorBar: { width: 4 },
  eventInfo: { flex: 1, padding: 10 },
  eventTitle: { fontSize: 15, fontWeight: '500' },
  eventTime: { fontSize: 12, marginTop: 2 },
});
