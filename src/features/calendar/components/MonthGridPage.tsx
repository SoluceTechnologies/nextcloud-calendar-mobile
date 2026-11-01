import { memo, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import { useSettingsStore } from '@/stores/settingsStore';
import type { CalendarEvent } from '@/types';
import { LONG_PRESS_MS } from '../constants';
import { contrastFor } from '../utils/eventInk';
import { dayKey } from '../utils/grid';
import {
  MONTH_CHIP_HEIGHT,
  MONTH_LINE_HEIGHT,
  MONTH_NUMBER_AREA,
  layoutWeek,
  linesFor,
  monthWeeks,
  type WeekSegment,
} from '../utils/monthLayout';

dayjs.extend(localizedFormat);

const COLUMN_PERCENT = 100 / 7;

interface Props {
  year: number;
  month: number;
  weekStartsOn: 0 | 1;
  events: CalendarEvent[];
  height: number;
  todayKey: string;
  onOpenDay: (day: Date) => void;
  onLongPressDay: (day: Date) => void;
}

function Segment({ segment, dimmed, untitled }: { segment: WeekSegment; dimmed: boolean; untitled: string }) {
  const { event, startColumn, endColumn, lane, continuesLeft, continuesRight } = segment;
  const ink = contrastFor(event.color);
  return (
    <View
      style={{
        position: 'absolute',
        top: MONTH_NUMBER_AREA + lane * MONTH_LINE_HEIGHT,
        left: `${startColumn * COLUMN_PERCENT}%`,
        width: `${(endColumn - startColumn + 1) * COLUMN_PERCENT}%`,
        paddingLeft: continuesLeft ? 0 : 2,
        paddingRight: continuesRight ? 0 : 2,
        opacity: dimmed ? 0.5 : 1,
      }}
    >
      <View
        style={[
          styles.chip,
          { backgroundColor: event.color },
          continuesLeft && styles.squareLeft,
          continuesRight && styles.squareRight,
        ]}
      >
        <Text
          style={[styles.chipText, { color: ink.text }]}
          numberOfLines={1}
          ellipsizeMode="clip"
          allowFontScaling={false}
        >
          {event.summary || untitled}
        </Text>
      </View>
    </View>
  );
}

function MonthGridPageImpl({
  year, month, weekStartsOn, events, height, todayKey, onOpenDay, onLongPressDay,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const language = useSettingsStore((state) => state.language);

  const weeks = useMemo(() => monthWeeks(year, month, weekStartsOn), [year, month, weekStartsOn]);
  const lines = linesFor(height / weeks.length);

  const rows = useMemo(() => {
    const firstDay = weeks[0][0];
    const lastDay = weeks[weeks.length - 1][6];
    const pageEnd = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() + 1);
    const pageEvents = events.filter((event) => event.dtend >= firstDay && event.dtstart < pageEnd);
    return weeks.map((days) => {
      const layout = layoutWeek(days, pageEvents, lines);
      const eventCounts = days.map((_, column) => {
        const drawnCount = layout.segments
          .filter((segment) => segment.startColumn <= column && column <= segment.endColumn).length;
        const hiddenCount = layout.overflows.find((overflow) => overflow.column === column)?.count ?? 0;
        return drawnCount + hiddenCount;
      });
      return { days, layout, eventCounts };
    });
  }, [weeks, events, lines]);

  const { colors } = theme;
  const untitled = t('calendar.noTitle');

  return (
    <View style={styles.page}>
      {rows.map(({ days, layout, eventCounts }) => (
        <View key={dayKey(days[0])} style={[styles.week, { borderTopColor: colors.border }]}>
          {days.map((day, column) => {
            const key = dayKey(day);
            const isToday = key === todayKey;
            const isOutsideMonth = day.getMonth() !== month;
            const date = dayjs(day).locale(language).format('dddd, LL');
            const eventCount = eventCounts[column];
            return (
              <Pressable
                key={key}
                testID={`month-day-${key}`}
                style={[styles.cell, column > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel={eventCount
                  ? t('calendar.monthCell.a11y', { date, count: eventCount })
                  : t('calendar.monthCell.a11yEmpty', { date })}
                accessibilityHint={t('calendar.monthCell.hint')}
                onPress={() => onOpenDay(day)}
                onLongPress={() => onLongPressDay(day)}
                delayLongPress={LONG_PRESS_MS}
              >
                <View style={[styles.number, isToday && { backgroundColor: colors.primary }]}>
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.numberText,
                      {
                        color: isToday ? colors.primaryText : isOutsideMonth ? colors.textTertiary : colors.text,
                        fontWeight: isToday ? '700' : '400',
                      },
                    ]}
                  >
                    {day.getDate()}
                  </Text>
                </View>
              </Pressable>
            );
          })}

          {height > 0 && (
            <View
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {layout.segments.map((segment) => (
                <Segment
                  key={`${segment.event.uid}-${segment.event.dtstart.getTime()}-${segment.startColumn}`}
                  segment={segment}
                  dimmed={days[segment.startColumn].getMonth() !== month
                    && days[segment.endColumn].getMonth() !== month}
                  untitled={untitled}
                />
              ))}
              {layout.overflows.map(({ column, count }) => (
                <Text
                  key={`overflow-${column}`}
                  allowFontScaling={false}
                  style={[
                    styles.overflow,
                    {
                      top: MONTH_NUMBER_AREA + (lines - 1) * MONTH_LINE_HEIGHT,
                      left: `${column * COLUMN_PERCENT}%`,
                      color: colors.textSecondary,
                    },
                  ]}
                >
                  +{count}
                </Text>
              ))}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

export const MonthGridPage = memo(MonthGridPageImpl);

const styles = StyleSheet.create({
  page: { flex: 1 },
  week: { flex: 1, flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  cell: { flex: 1 },
  number: {
    width: 20, height: 20, borderRadius: 10, marginTop: 2,
    alignSelf: 'center', alignItems: 'center', justifyContent: 'center',
  },
  numberText: { fontSize: 12, textAlign: 'center' },
  chip: { height: MONTH_CHIP_HEIGHT, borderRadius: 4, paddingHorizontal: 4, justifyContent: 'center', overflow: 'hidden' },
  squareLeft: { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  squareRight: { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  chipText: { fontSize: 11, lineHeight: 13, fontWeight: '500' },
  overflow: { position: 'absolute', width: `${COLUMN_PERCENT}%`, paddingLeft: 4, fontSize: 11, lineHeight: 14, fontWeight: '600' },
});
