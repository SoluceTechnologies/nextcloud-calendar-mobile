import { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { CalendarHeaderProps, ICalendarEventBase, Mode } from 'react-native-big-calendar';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { useTheme } from 'expo-router';
import { useSettingsStore } from '@/stores/settingsStore';

dayjs.extend(isoWeek);

const ALL_DAY_EVENT_ROW_HEIGHT = 26;

export function FixedCalendarHeader<T extends ICalendarEventBase>({
  mode, dateRange, cellHeight, style,
  allDayEvents, allDayEventCellStyle, allDayEventCellTextColor, allDayEventCellAccessibilityProps,
  onPressDateHeader, onPressEvent, activeDate,
  showAllDayEventCell = true, hideHours = false,
  headerContainerAccessibilityProps, headerCellAccessibilityProps,
}: CalendarHeaderProps<T> & { mode: Mode }) {
  const theme = useTheme();
  const language = useSettingsStore((s) => s.language);

  const { allDaySectionHeight, matchedByDate } = useMemo(() => {
    if (!showAllDayEventCell || allDayEvents.length === 0) {
      return { allDaySectionHeight: 0, matchedByDate: [] as T[][] };
    }
    const matched = dateRange.map((date) => {
      const day = date.startOf('day');
      return allDayEvents.filter((event) => {
        const s = dayjs(event.start).startOf('day');
        const e = dayjs(event.end).startOf('day');
        return !day.isBefore(s) && !day.isAfter(e);
      });
    });
    const maxPerDay = Math.max(...matched.map((m) => m.length));
    return { allDaySectionHeight: maxPerDay * ALL_DAY_EVENT_ROW_HEIGHT + 4, matchedByDate: matched };
  }, [allDayEvents, dateRange, showAllDayEventCell]);

  return (
    <View
      style={[
        { flexDirection: 'row' },
        showAllDayEventCell && { borderBottomWidth: 2, borderBottomColor: theme.colors.border },
        style,
      ]}
      {...headerContainerAccessibilityProps}
    >
      {!hideHours && <View style={{ zIndex: 10, width: 50 }} />}
      {dateRange.map((date, dateIndex) => {
        const isHighlight = activeDate ? dayjs(activeDate).isSame(date, 'date') : dayjs().isSame(date, 'day');
        const dayAllDayEvents = matchedByDate[dateIndex] ?? [];
        return (
          <TouchableOpacity
            key={date.toString()}
            style={{ flex: 1, paddingTop: 8 }}
            onPress={() => onPressDateHeader?.(date.toDate())}
            disabled={!onPressDateHeader}
            {...headerCellAccessibilityProps}
          >
            <View style={{ height: 56, justifyContent: 'space-between' }}>
              <Text style={{ textAlign: 'center', fontSize: 13, fontWeight: '600', textTransform: 'capitalize', color: isHighlight ? theme.colors.primary : theme.colors.textSecondary }}>
                {dayjs(date.toDate()).locale(language).format('ddd')}
              </Text>
              <View style={[
                { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
                isHighlight && { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.primary, marginBottom: 0 },
              ]}>
                <Text style={{ fontSize: 20, textAlign: 'center', color: isHighlight ? '#fff' : theme.colors.text }}>
                  {date.format('D')}
                </Text>
              </View>
            </View>
            {showAllDayEventCell && dayAllDayEvents.length > 0 && (
              <View style={{ borderLeftWidth: 1, borderLeftColor: theme.colors.border, height: allDaySectionHeight }}>
                {dayAllDayEvents
                  .map((event, index) => {
                    const evStyle = typeof allDayEventCellStyle === 'function' ? allDayEventCellStyle(event) : (allDayEventCellStyle ?? {});
                    return (
                      <TouchableOpacity
                        key={index}
                        style={[{ backgroundColor: theme.colors.primary, borderRadius: 2, paddingHorizontal: 4, paddingVertical: 2, marginTop: 4, marginHorizontal: 2 }, evStyle]}
                        onPress={() => onPressEvent?.(event)}
                        {...allDayEventCellAccessibilityProps}
                      >
                        <Text style={{ fontSize: 12, color: allDayEventCellTextColor || '#fff' }} numberOfLines={1}>
                          {event.title}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
