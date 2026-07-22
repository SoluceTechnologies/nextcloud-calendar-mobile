import { memo, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  useWindowDimensions,
} from 'react-native';
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import { useSettingsStore } from '@/stores/settingsStore';
import type { CalendarEvent } from '@/types';

dayjs.extend(localizedFormat);

interface Props {
  date: Date;
  events: CalendarEvent[];
  weekStartsOn: 0 | 1;
  onSelectDate: (d: Date) => void;
  onPressEvent: (e: CalendarEvent) => void;
  onPressCell: (d: Date) => void;
}

export function buildMonthGrid(year: number, month: number, weekStartsOn: 0 | 1): (dayjs.Dayjs | null)[][] {
  const firstOfMonth = dayjs(new Date(year, month, 1));

  const offset = (firstOfMonth.day() - weekStartsOn + 7) % 7;

  const rows: (dayjs.Dayjs | null)[][] = [];
  let cursor = firstOfMonth.subtract(offset, 'day');
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

export function eventDayKeys(e: CalendarEvent): string[] {
  const start = dayjs(e.dtstart);
  const startKey = start.format('YYYY-MM-DD');
  if (!e.allDay) return [startKey];
  const endDay = dayjs(e.dtend).startOf('day');
  const keys: string[] = [];
  let cur = start.startOf('day');
  while (!cur.isAfter(endDay, 'day') && keys.length <= 366) {
    keys.push(cur.format('YYYY-MM-DD'));
    cur = cur.add(1, 'day');
  }
  return keys.length ? keys : [startKey];
}

export function eventCoversDay(e: CalendarEvent, dayKey: string): boolean {
  const startKey = dayjs(e.dtstart).format('YYYY-MM-DD');
  if (!e.allDay) return startKey === dayKey;
  const endKey = dayjs(e.dtend).format('YYYY-MM-DD');
  return dayKey >= startKey && dayKey <= (endKey < startKey ? startKey : endKey);
}

function MonthDayViewImpl({ date, events, weekStartsOn, onSelectDate, onPressEvent, onPressCell }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const language = useSettingsStore((s) => s.language);
  const { height } = useWindowDimensions();

  const selected = useMemo(() => dayjs(date), [date]);

  const year = dayjs(date).year();
  const month = dayjs(date).month();

  const grid = useMemo(() => buildMonthGrid(year, month, weekStartsOn), [year, month, weekStartsOn]);

  const dotMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const add = (key: string, color: string) => {
      let set = map.get(key);
      if (!set) { set = new Set(); map.set(key, set); }
      set.add(color);
    };

    for (const ev of events) {
      if (ev.allDay) continue;
      add(dayjs(ev.dtstart).format('YYYY-MM-DD'), ev.color);
    }

    for (const ev of events) {
      if (!ev.allDay) continue;
      for (const key of eventDayKeys(ev)) add(key, ev.color);
    }
    return map;
  }, [events]);

  const dayEvents = useMemo(() => {
    const sel = selected.format('YYYY-MM-DD');
    return events
      .filter((e) => eventCoversDay(e, sel))
      .sort((a, b) => a.dtstart.getTime() - b.dtstart.getTime());
  }, [events, selected]);

  const today = dayjs();

  const handleDayPress = useCallback((d: dayjs.Dayjs) => {
    onSelectDate(d.toDate());
  }, [onSelectDate]);

  const dayHeaders = useMemo(() => {
    const headers: string[] = [];
    for (let i = 0; i < 7; i++) {
      const dow = (weekStartsOn + i) % 7;
      headers.push(dayjs().day(dow).locale(language).format('dd'));
    }
    return headers;
  }, [weekStartsOn, language]);

  const gridHeight = height * 0.44;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.grid, { height: gridHeight, borderBottomColor: theme.colors.border }]}>
        <View style={styles.dowRow}>
          {dayHeaders.map((d, i) => (
            <Text key={i} style={[styles.dowLabel, { color: theme.colors.textTertiary }]}>{d}</Text>
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
              const isSelected = d.isSame(selected, 'day');
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
                    { backgroundColor: isSelected ? theme.colors.primary : 'transparent' },
                    { borderWidth: isToday && !isSelected ? 1.5 : 0, borderColor: theme.colors.primary },
                  ]}>
                    <Text
                      numberOfLines={1}
                      allowFontScaling={false}
                      style={[
                        styles.dayNumber,
                        { color: isSelected
                          ? theme.colors.primaryText
                          : isToday
                            ? theme.colors.primary
                            : theme.colors.text, fontWeight: isSelected || isToday ? '700' : '400' },
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
        <Text style={[styles.dayListHeader, { color: theme.colors.textSecondary }]}>
          {selected.locale(language).format('dddd, LL')}
        </Text>
        {dayEvents.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.colors.textTertiary }]}>{t('calendar.noEvents')}</Text>
        ) : (
          <FlatList
            data={dayEvents}
            keyExtractor={(e) => `${e.calendarId}-${e.uid}-${e.dtstart.getTime()}`}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.eventRow, { borderLeftColor: item.color, backgroundColor: theme.colors.surface }]}
                onPress={() => onPressEvent(item)}
              >
                <View style={[styles.eventColorBar, { backgroundColor: item.color }]} />
                <View style={styles.eventInfo}>
                  <Text style={[styles.eventTitle, { color: theme.colors.text }]} numberOfLines={1}>
                    {item.summary}
                  </Text>
                  <Text style={[styles.eventTime, { color: theme.colors.textSecondary }]}>
                    {item.allDay
                      ? t('calendar.allDay')
                      : `${dayjs(item.dtstart).locale(language).format('LT')} – ${dayjs(item.dtend).locale(language).format('LT')}`}
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

export const MonthDayView = memo(MonthDayViewImpl);

const styles = StyleSheet.create({
  container: { flex: 1 },
  grid: { borderBottomWidth: StyleSheet.hairlineWidth },
  dowRow: { flexDirection: 'row', paddingVertical: 6 },
  dowLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  weekRow: { flex: 1, flexDirection: 'row' },
  dayCell: { flex: 1, alignItems: 'center', paddingTop: 2 },
  dayCircle: { width: 28, height: 28, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  dayNumber: { fontSize: 14, textAlign: 'center' },
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
