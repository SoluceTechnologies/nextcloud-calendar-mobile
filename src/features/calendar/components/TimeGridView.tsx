import { memo, type ComponentProps, type ReactElement } from 'react';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import type { ViewMode } from '@/types';
import { CAL_MODES, type CalMode } from '../constants';
import type { BigCalendarEvent } from '../utils/toCalendarEvents';
import { CalendarInstance } from './CalendarInstance';

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
            <CalendarInstance
              key={m}
              mode={m}
              calendarKey={calendarKey}
              visible={viewMode === m}
              events={events}
              date={calDates[m]}
              height={heightFor(m, calDates[m])}
              hourRowHeight={hourRowHeight}
              weekStartsOn={weekStartsOn}
              scrollOffset={scrollOffset}
              onPressEvent={onPressEvent}
              onPressCell={onPressCell}
              onSwipeEnd={onSwipeEndHandlers[m]}
              renderEvent={renderEvent}
              eventCellStyle={eventCellStyle}
              bigCalendarTheme={bigCalendarTheme}
            />
          ) : null
        )}
      </View>
    </GestureDetector>
  );
}

export const TimeGridView = memo(TimeGridViewImpl);
