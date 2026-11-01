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

const COL_PCT = 100 / 7;

interface Props {
  year: number;
  month: number;
  weekStartsOn: 0 | 1;
  events: CalendarEvent[];
  height: number;
  todayKey: string;
  onOpenDay: (d: Date) => void;
  onLongPressDay: (d: Date) => void;
}

function Segment({ segment, dimmed, untitled }: { segment: WeekSegment; dimmed: boolean; untitled: string }) {
  const { event, col0, col1, lane, continuesLeft, continuesRight } = segment;
  const ink = contrastFor(event.color);
  return (
    <View
      style={{
        position: 'absolute',
        top: MONTH_NUMBER_AREA + lane * MONTH_LINE_HEIGHT,
        left: `${col0 * COL_PCT}%`,
        width: `${(col1 - col0 + 1) * COL_PCT}%`,
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
  const language = useSettingsStore((s) => s.language);

  const weeks = useMemo(() => monthWeeks(year, month, weekStartsOn), [year, month, weekStartsOn]);
  const lines = linesFor(height / weeks.length);

  const rows = useMemo(() => {
    const first = weeks[0][0];
    const last = weeks[weeks.length - 1][6];
    const end = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
    const visible = events.filter((e) => e.dtend >= first && e.dtstart < end);
    return weeks.map((days) => {
      const layout = layoutWeek(days, visible, lines);
      const counts = days.map((_, col) => {
        const drawn = layout.segments.filter((s) => s.col0 <= col && col <= s.col1).length;
        return drawn + (layout.more.find((m) => m.col === col)?.count ?? 0);
      });
      return { days, layout, counts };
    });
  }, [weeks, events, lines]);

  const { colors } = theme;
  const untitled = t('calendar.noTitle');

  return (
    <View style={styles.page}>
      {rows.map(({ days, layout, counts }) => (
        <View key={dayKey(days[0])} style={[styles.week, { borderTopColor: colors.border }]}>
          {days.map((d, col) => {
            const key = dayKey(d);
            const isToday = key === todayKey;
            const outside = d.getMonth() !== month;
            const date = dayjs(d).locale(language).format('dddd, LL');
            return (
              <Pressable
                key={key}
                testID={`month-day-${key}`}
                style={[styles.cell, col > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel={counts[col]
                  ? t('calendar.monthCell.a11y', { date, count: counts[col] })
                  : t('calendar.monthCell.a11yEmpty', { date })}
                accessibilityHint={t('calendar.monthCell.hint')}
                onPress={() => onOpenDay(d)}
                onLongPress={() => onLongPressDay(d)}
                delayLongPress={LONG_PRESS_MS}
              >
                <View style={[styles.number, isToday && { backgroundColor: colors.primary }]}>
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.numberText,
                      {
                        color: isToday ? colors.primaryText : outside ? colors.textTertiary : colors.text,
                        fontWeight: isToday ? '700' : '400',
                      },
                    ]}
                  >
                    {d.getDate()}
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
              {layout.segments.map((s) => (
                <Segment
                  key={`${s.event.uid}-${s.event.dtstart.getTime()}-${s.col0}`}
                  segment={s}
                  dimmed={days[s.col0].getMonth() !== month && days[s.col1].getMonth() !== month}
                  untitled={untitled}
                />
              ))}
              {layout.more.map(({ col, count }) => (
                <Text
                  key={`more-${col}`}
                  allowFontScaling={false}
                  style={[
                    styles.more,
                    {
                      top: MONTH_NUMBER_AREA + (lines - 1) * MONTH_LINE_HEIGHT,
                      left: `${col * COL_PCT}%`,
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
  more: { position: 'absolute', width: `${COL_PCT}%`, paddingLeft: 4, fontSize: 11, lineHeight: 14, fontWeight: '600' },
});
