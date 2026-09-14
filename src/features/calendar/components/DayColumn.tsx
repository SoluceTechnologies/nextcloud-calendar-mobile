import { memo, useCallback, useMemo, useRef } from 'react';
import { View, Pressable, StyleSheet, type GestureResponderEvent } from 'react-native';
import { useTheme } from 'expo-router';
import dayjs from 'dayjs';
import { eventPositionStyle, nowTopPct } from '../utils/grid';
import type { CalendarEvent } from '@/types';
import type { GridEvent } from '../utils/toGridEvents';
import type { PositionedEvent } from '../utils/eventLayout';
import { TimeGridEvent } from './TimeGridEvent';

/** Movement (dp) beyond which a touch is a swipe, not a tap. */
const TAP_SLOP = 10;

interface Props {
  date: Date;
  positioned: PositionedEvent[];
  hourRowHeight: number;
  now: Date;
  onPressSlot: (d: Date) => void;
  onPressEvent: (e: GridEvent) => void;
  onToggleTask?: (e: CalendarEvent) => void;
  dimmedUid?: string;
}

function DayColumnImpl({ date, positioned, hourRowHeight, now, onPressSlot, onPressEvent, onToggleTask, dimmedUid }: Props) {
  const { colors } = useTheme();
  const isToday = dayjs(now).isSame(date, 'day');

  const columnStyle = useMemo(
    () => [styles.column, { borderLeftWidth: 1, borderLeftColor: colors.border }],
    [colors.border]
  );

  // A fast fling through the pager can reach this surface as a press, released far from where it
  // started (with a meaningless locationY): only a touch that stayed put is a tap.
  const pressIn = useRef<GestureResponderEvent['nativeEvent'] | null>(null);
  const handlePressIn = useCallback((e: GestureResponderEvent) => {
    pressIn.current = e.nativeEvent;
  }, []);

  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      const start = pressIn.current ?? e.nativeEvent;
      pressIn.current = null;
      const moved = Math.hypot(e.nativeEvent.pageX - start.pageX, e.nativeEvent.pageY - start.pageY);
      if (moved > TAP_SLOP) return;
      const raw = Math.floor(start.locationY / hourRowHeight);
      const hour = Math.min(23, Math.max(0, raw));
      onPressSlot(dayjs(date).hour(hour).minute(0).second(0).millisecond(0).toDate());
    },
    [date, hourRowHeight, onPressSlot]
  );

  return (
    <View testID="day-column" style={columnStyle}>
      <Pressable testID="day-column-surface" style={StyleSheet.absoluteFill} onPressIn={handlePressIn} onPress={handlePress} />

      {positioned.map(({ event, leftPct, widthPct, zIndex }, i) => {
        const { top, height } = eventPositionStyle(event.start, event.end);
        return (
          <TimeGridEvent
            key={`${event._event.uid}-${event.start.getTime()}-${i}`}
            event={event}
            top={top}
            height={height}
            leftPct={leftPct}
            widthPct={widthPct}
            zIndex={zIndex}
            hourRowHeight={hourRowHeight}
            dimmed={dimmedUid === event._event.uid}
            onPress={onPressEvent}
            onToggleTask={onToggleTask}
          />
        );
      })}

      {isToday && (
        <View
          testID="now-indicator"
          pointerEvents="none"
          style={[styles.nowIndicator, { top: `${nowTopPct(now)}%` }]}
        />
      )}
    </View>
  );
}

export const DayColumn = memo(DayColumnImpl);

const styles = StyleSheet.create({
  column: { flex: 1, overflow: 'hidden' },
  nowIndicator: {
    position: 'absolute',
    zIndex: 10000,
    height: 2,
    width: '100%',
    backgroundColor: 'red',
  },
});
