import { memo, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { dayKey } from '../utils/grid';
import type { CalendarEvent } from '@/types';
import type { GridEvent } from '../utils/toGridEvents';
import { layoutDay, type PositionedEvent } from '../utils/eventLayout';
import { useEventDrag } from '../hooks/useEventDrag';
import { DayColumn } from './DayColumn';
import { DragGhost } from './DragGhost';

const EMPTY: GridEvent[] = [];

interface Props {
  dates: Date[];
  dayIndex: Map<string, GridEvent[]>;
  hourRowHeight: number;
  now: Date;
  onPressSlot: (d: Date) => void;
  onPressEvent: (e: GridEvent) => void;
  onMoveEvent?: (event: GridEvent, nextStart: Date, nextEnd: Date) => void;
  onToggleTask?: (e: CalendarEvent) => void;
}

function TimeGridPageImpl({
  dates,
  dayIndex,
  hourRowHeight,
  now,
  onPressSlot,
  onPressEvent,
  onMoveEvent,
  onToggleTask,
}: Props) {
  const layoutCache = useRef(new WeakMap<GridEvent[], PositionedEvent[]>());
  const layouts = useMemo(
    () =>
      dates.map((d) => {
        const slices = dayIndex.get(dayKey(d)) ?? EMPTY;
        const cached = layoutCache.current.get(slices);
        if (cached) return cached;
        const laid = layoutDay(slices);
        layoutCache.current.set(slices, laid);
        return laid;
      }),
    [dates, dayIndex]
  );

  const [pageWidth, setPageWidth] = useState(0);
  const columnWidth = dates.length > 0 ? pageWidth / dates.length : 0;
  const handleLayout = (e: LayoutChangeEvent) => setPageWidth(e.nativeEvent.layout.width);

  const { gesture, drag, translateX, translateY, height } = useEventDrag({
    dates,
    layouts,
    hourRowHeight,
    columnWidth,
    onMoveEvent,
  });

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.row} onLayout={handleLayout}>
        {dates.map((date, i) => (
          <DayColumn
            key={dayKey(date)}
            date={date}
            positioned={layouts[i]}
            hourRowHeight={hourRowHeight}
            now={now}
            onPressSlot={onPressSlot}
            onPressEvent={onPressEvent}
            onToggleTask={onToggleTask}
            dimmedUid={drag?.columnIndex === i ? drag.event._event.uid : undefined}
          />
        ))}
        {drag && (
          <DragGhost
            event={drag.event}
            translateX={translateX}
            translateY={translateY}
            height={height}
            restingHeight={drag.heightPx}
            resizing={drag.mode !== 'move'}
            width={columnWidth}
          />
        )}
      </View>
    </GestureDetector>
  );
}

export const TimeGridPage = memo(TimeGridPageImpl);

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row' },
});
