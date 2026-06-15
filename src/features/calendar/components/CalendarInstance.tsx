import { memo, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Calendar } from 'react-native-big-calendar';
import { styles } from '@/styles/calendarScreen';
import { FixedCalendarHeader } from '@/components/CalendarHeader';
import { resolveFrozenProps } from '../utils/resolveFrozenProps';
import type { CalMode } from '../constants';
import type { BigCalendarEvent } from '../utils/toCalendarEvents';

interface LiveProps {
  events: BigCalendarEvent[];
  date: Date;
  height: number;
  hourRowHeight: number;
  weekStartsOn: 0 | 1;
  scrollOffset: number;
  onPressEvent: (event: any) => void;
  onPressCell: (d: Date) => void;
  onSwipeEnd: (d: Date) => void;
  renderEvent: (event: any, touchableOpacityProps: any) => any;
  eventCellStyle: (event: any) => any;
  bigCalendarTheme: any;
}

interface Props extends LiveProps {
  mode: CalMode;
  calendarKey: string;
  visible: boolean;
}

function CalendarInstanceImpl({ mode, calendarKey, visible, ...live }: Props) {
  // Hold the last props rendered while visible; reuse them (same refs) while
  // hidden so the memo'd <Calendar> does not rebuild on unrelated state changes.
  const frozen = useRef<LiveProps>(live);
  const { props, nextFrozen } = resolveFrozenProps(visible, live as LiveProps, frozen.current);
  frozen.current = nextFrozen;

  return (
    <View
      style={[StyleSheet.absoluteFill, { opacity: visible ? 1 : 0, zIndex: visible ? 1 : 0 }]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <View style={styles.calendarWrapper}>
        <Calendar
          key={calendarKey}
          events={props.events}
          mode={mode}
          date={props.date}
          height={props.height}
          hourRowHeight={props.hourRowHeight}
          timeslots={1}
          weekStartsOn={props.weekStartsOn}
          weekEndsOn={((props.weekStartsOn + 6) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6}
          onPressEvent={props.onPressEvent}
          onPressCell={props.onPressCell}
          onSwipeEnd={props.onSwipeEnd}
          scrollOffsetMinutes={props.scrollOffset}
          renderHeader={FixedCalendarHeader}
          renderEvent={props.renderEvent}
          eventCellStyle={props.eventCellStyle}
          allDayEventCellStyle={props.eventCellStyle}
          theme={props.bigCalendarTheme}
        />
      </View>
    </View>
  );
}

export const CalendarInstance = memo(CalendarInstanceImpl);
