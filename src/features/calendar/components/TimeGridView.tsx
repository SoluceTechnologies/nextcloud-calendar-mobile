import { memo, type ComponentProps, type ReactElement } from 'react';
import { View, StyleSheet } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { Calendar } from 'react-native-big-calendar';
import { styles } from '@/styles/calendarScreen';
import { FixedCalendarHeader } from '@/components/CalendarHeader';
import type { ViewMode } from '@/types';
import { CAL_MODES, type CalMode } from '../constants';
import type { BigCalendarEvent } from '../utils/toCalendarEvents';

interface Props {
  pinchGesture: ComponentProps<typeof GestureDetector>['gesture'];
  mountedCalModes: Set<CalMode>;
  viewMode: ViewMode;
  calendarKey: string;
  events: BigCalendarEvent[];
  calDates: Record<CalMode, Date>;
  heightFor: (m: CalMode, focusDate: Date) => number;
  hourRowHeight: number;
  weekStartsOn: 0 | 1;
  scrollOffset: number;
  onPressEvent: (event: any) => void;
  onPressCell: (d: Date) => void;
  onSwipeEndHandlers: Record<CalMode, (d: Date) => void>;
  renderEvent: (event: any, touchableOpacityProps: any) => ReactElement;
  eventCellStyle: (event: any) => any;
  bigCalendarTheme: any;
}

function TimeGridViewImpl({
  pinchGesture, mountedCalModes, viewMode, calendarKey, events, calDates, heightFor,
  hourRowHeight, weekStartsOn, scrollOffset, onPressEvent, onPressCell,
  onSwipeEndHandlers, renderEvent, eventCellStyle, bigCalendarTheme,
}: Props) {
  return (
    <GestureDetector gesture={pinchGesture}>
      <View style={{ flex: 1 }}>
        {CAL_MODES.map((m) =>
          mountedCalModes.has(m) ? (
            <View
              key={m}
              style={[StyleSheet.absoluteFill, { opacity: viewMode === m ? 1 : 0, zIndex: viewMode === m ? 1 : 0 }]}
              pointerEvents={viewMode === m ? 'auto' : 'none'}
            >
              <View style={styles.calendarWrapper}>
                <Calendar
                  key={calendarKey}
                  events={events}
                  mode={m}
                  date={calDates[m]}
                  height={heightFor(m, calDates[m])}
                  hourRowHeight={hourRowHeight}
                  timeslots={1}
                  weekStartsOn={weekStartsOn}
                  weekEndsOn={((weekStartsOn + 6) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6}
                  onPressEvent={onPressEvent}
                  onPressCell={onPressCell}
                  onSwipeEnd={onSwipeEndHandlers[m]}
                  scrollOffsetMinutes={scrollOffset}
                  renderHeader={FixedCalendarHeader}
                  renderEvent={renderEvent}
                  eventCellStyle={eventCellStyle}
                  allDayEventCellStyle={eventCellStyle}
                  theme={bigCalendarTheme}
                />
              </View>
            </View>
          ) : null
        )}
      </View>
    </GestureDetector>
  );
}

export const TimeGridView = memo(TimeGridViewImpl);
