import { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { CalendarHeaderProps, ICalendarEventBase, Mode } from 'react-native-big-calendar';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { useTheme, getContrastColor } from '@/hooks/useTheme';

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

  const allDaySectionHeight = useMemo(() => {
    if (!showAllDayEventCell || allDayEvents.length === 0) return 0;
    const maxPerDay = Math.max(...dateRange.map((date) =>
      allDayEvents.filter((event) => {
        const s = dayjs(event.start).startOf('day');
        const e = dayjs(event.end).startOf('day');
        return !date.startOf('day').isBefore(s) && !date.startOf('day').isAfter(e);
      }).length
    ));
    return maxPerDay * ALL_DAY_EVENT_ROW_HEIGHT + 4;
  }, [allDayEvents, dateRange, showAllDayEventCell]);

  return (
    <View
      style={[
        { flexDirection: 'row' },
        showAllDayEventCell && { borderBottomWidth: 2, borderBottomColor: theme.border },
        style,
      ]}
      {...headerContainerAccessibilityProps}
    >
      {!hideHours && <View style={{ zIndex: 10, width: 50 }} />}
      {dateRange.map((date) => {
        const isHighlight = activeDate ? dayjs(activeDate).isSame(date, 'date') : dayjs().isSame(date, 'day');
        return (
          <TouchableOpacity
            key={date.toString()}
            style={{ flex: 1, paddingTop: 8 }}
            onPress={() => onPressDateHeader?.(date.toDate())}
            disabled={!onPressDateHeader}
            {...headerCellAccessibilityProps}
          >
            <View style={{ height: 56, justifyContent: 'space-between' }}>
              <Text style={{ textAlign: 'center', fontSize: 12, color: isHighlight ? theme.primary : theme.textSecondary }}>
                {date.format('ddd')}
              </Text>
              <View style={[
                { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
                isHighlight && { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.primary, marginBottom: 0 },
              ]}>
                <Text style={{ fontSize: 20, textAlign: 'center', color: isHighlight ? getContrastColor(theme.primary) : theme.text }}>
                  {date.format('D')}
                </Text>
              </View>
            </View>
            {showAllDayEventCell && allDayEvents.length > 0 && (
              <View style={{ borderLeftWidth: 1, borderLeftColor: theme.border, height: allDaySectionHeight }}>
                {allDayEvents
                  .filter((event) => {
                    const s = dayjs(event.start).startOf('day');
                    const e = dayjs(event.end).startOf('day');
                    return !date.startOf('day').isBefore(s) && !date.startOf('day').isAfter(e);
                  })
                  .map((event, index) => {
                    const evStyle = typeof allDayEventCellStyle === 'function' ? allDayEventCellStyle(event) : (allDayEventCellStyle ?? {});
                    const eventColor = (evStyle as any)?.backgroundColor || theme.primary;
                    return (
                      <TouchableOpacity
                        key={index}
                        style={[{ backgroundColor: theme.primary, borderRadius: 2, paddingHorizontal: 4, paddingVertical: 2, marginTop: 4, marginHorizontal: 2 }, evStyle]}
                        onPress={() => onPressEvent?.(event)}
                        {...allDayEventCellAccessibilityProps}
                      >
                        <Text style={{ fontSize: 12, color: allDayEventCellTextColor || getContrastColor(eventColor) }} numberOfLines={1}>
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
