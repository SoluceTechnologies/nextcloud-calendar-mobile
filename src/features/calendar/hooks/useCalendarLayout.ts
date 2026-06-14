import { useCallback, useMemo, useState } from 'react';
import { useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CalendarEvent } from '@/types';
import type { CalMode } from '../constants';
import { headerHeightForMode, calBodyHeight, nowScrollOffset } from '../utils/layout';

export function useCalendarLayout(
  allEvents: CalendarEvent[],
  weekStartsOn: 0 | 1,
  hourRowHeight: number,
) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [availH, setAvailH] = useState(0);
  const onViewAreaLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setAvailH((prev) => (Math.abs(prev - h) > 1 ? h : prev));
  }, []);

  const allDayEvents = useMemo(() => allEvents.filter((e) => e.allDay), [allEvents]);

  const headerHeight = 44 + 40 + insets.top;
  const calHeight = windowHeight - headerHeight - insets.bottom - 49;
  const calArea = availH > 0 ? availH : calHeight;

  const scrollOffset = useMemo(() => nowScrollOffset(hourRowHeight), [hourRowHeight]);

  const heightFor = useCallback(
    (m: CalMode, focusDate: Date) =>
      calBodyHeight(calArea, headerHeightForMode(m, focusDate, allDayEvents, weekStartsOn), hourRowHeight),
    [calArea, allDayEvents, weekStartsOn, hourRowHeight]
  );

  return { insets, onViewAreaLayout, heightFor, scrollOffset };
}
