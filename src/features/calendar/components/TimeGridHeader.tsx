import { memo, useMemo } from 'react';
import { View, Text, Pressable, TouchableOpacity } from 'react-native';
import { useTheme } from 'expo-router';
import dayjs from 'dayjs';
import { Square, SquareCheck } from 'lucide-react-native';
import { useSettingsStore } from '@/stores/settingsStore';
import type { CalendarEvent } from '@/types';
import {
  ALL_DAY_CHIP_GAP,
  ALL_DAY_CHIP_HEIGHT,
  allDayEventsForDay,
  allDayRowHeight,
  dayKey,
} from '../utils/grid';

interface Props {
  dates: Date[];
  now: Date;
  allDayEvents: CalendarEvent[];
  onPressEvent: (event: CalendarEvent) => void;
  onToggleTask?: (event: CalendarEvent) => void;
}

function TimeGridHeaderImpl({ dates, now, allDayEvents, onPressEvent, onToggleTask }: Props) {
  const theme = useTheme();
  const language = useSettingsStore((s) => s.language);

  const { sectionHeight, byDate } = useMemo(
    () => ({
      sectionHeight: allDayRowHeight(dates, allDayEvents),
      byDate: dates.map((d) => allDayEventsForDay(d, allDayEvents)),
    }),
    [dates, allDayEvents]
  );

  return (
    <View style={{ flexDirection: 'row', flex: 1 }}>
      {dates.map((date, i) => {
        const isHighlight = dayjs(now).isSame(date, 'day');
        return (
          <View key={dayKey(date)} style={{ flex: 1, paddingTop: 8 }}>
            <View style={{ height: 56, justifyContent: 'space-between' }}>
              <Text
                style={{
                  textAlign: 'center', fontSize: 13, fontWeight: '600', textTransform: 'capitalize',
                  color: isHighlight ? theme.colors.primary : theme.colors.textSecondary,
                }}
              >
                {dayjs(date).locale(language).format('ddd')}
              </Text>
              <View
                testID={isHighlight ? `day-highlight-${dayKey(date)}` : undefined}
                style={[
                  { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
                  isHighlight && {
                    width: 36, height: 36, borderRadius: 18,
                    backgroundColor: theme.colors.primary, marginBottom: 0,
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  allowFontScaling={false}
                  style={{ fontSize: 20, textAlign: 'center', color: isHighlight ? '#fff' : theme.colors.text }}
                >
                  {dayjs(date).format('D')}
                </Text>
              </View>
            </View>

            {byDate[i].length > 0 && (
              <View style={{ borderLeftWidth: 1, borderLeftColor: theme.colors.border, height: sectionHeight }}>
                {byDate[i].map((event, chipIndex) => (
                  <TouchableOpacity
                    key={`${event.uid}-${event.dtstart.getTime()}-${chipIndex}`}
                    style={{
                      backgroundColor: event.color,
                      borderRadius: 2,
                      paddingHorizontal: 4,
                      height: ALL_DAY_CHIP_HEIGHT,
                      justifyContent: 'center',
                      marginTop: ALL_DAY_CHIP_GAP,
                      marginHorizontal: 2,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 3,
                      opacity: event.taskCompleted ? 0.55 : 1,
                    }}
                    onPress={() => onPressEvent(event)}
                  >
                    {event.isTask && (
                      <Pressable
                        testID={`task-checkbox-${event.uid}`}
                        onPress={() => onToggleTask?.(event)}
                        disabled={!onToggleTask || event.readOnly}
                        hitSlop={6}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: !!event.taskCompleted }}
                      >
                        {event.taskCompleted
                          ? <SquareCheck size={13} color="#fff" />
                          : <Square size={13} color="#fff" />}
                      </Pressable>
                    )}
                    <Text
                      style={{
                        fontSize: 12, lineHeight: 14, color: '#fff', flexShrink: 1,
                        textDecorationLine: event.taskCompleted ? 'line-through' : 'none',
                      }}
                      numberOfLines={1}
                      allowFontScaling={false}
                    >
                      {event.summary}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

export const TimeGridHeader = memo(TimeGridHeaderImpl);
