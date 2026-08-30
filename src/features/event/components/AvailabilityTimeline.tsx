import { memo, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, StyleSheet, Pressable, ScrollView, type GestureResponderEvent } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import dayjs from 'dayjs';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GripVertical } from 'lucide-react-native';
import { GridLines } from '@/features/calendar/components/GridLines';
import { HourRail } from '@/features/calendar/components/HourRail';
import { Typography } from '@/ui/components';
import { useSlotDrag } from '@/features/event/hooks/useSlotDrag';
import type { BusySlot, SuggestedSlot } from '@/types';

const FREE_COLOR = '#4caf50';
const FREE_BG_ALPHA = 0.12;
const BUSY_UNAVAILABLE_PATTERN = '#9e9e9e';
const HOUR_RAIL_WIDTH = 56;

interface Props {
  mergedBusy: BusySlot[];
  searchStart: Date;
  searchEnd: Date;
  initialStart: Date;
  durationMs: number;
  eventTitle: string;
  days: Date[];
  columnWidth: number;
  hourRowHeight: number;
  onApplySlot: (slot: SuggestedSlot) => void;
}

function AvailabilityTimelineImpl({
  mergedBusy,
  initialStart,
  durationMs,
  eventTitle,
  days,
  columnWidth,
  hourRowHeight,
  onApplySlot,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();

  // The brick owns the responder while dragging so the nested ScrollViews
  // cannot take over the gesture.

  // Filter busy slots per day
  const daysBusy = useMemo(() => {
    return days.map((day) => {
      const dayStart = dayjs(day).startOf('day');
      const dayEnd = dayjs(day).endOf('day');
      return mergedBusy.filter((s) => {
        const sStart = dayjs(s.start);
        return sStart.isAfter(dayStart.subtract(1, 'second')) && sStart.isBefore(dayEnd);
      });
    });
  }, [mergedBusy, days]);

  // Compute free zones per day
  const daysFreeZones = useMemo(() => {
    return daysBusy.map((dayBusy, dayIdx) => {
      const dayStart = dayjs(days[dayIdx]).startOf('day');
      const zones: { start: Date; end: Date }[] = [];
      let cursor = dayStart.toDate();

      for (const busy of dayBusy) {
        if (busy.start.getTime() > cursor.getTime()) {
          zones.push({ start: cursor, end: busy.start });
        }
        cursor = new Date(Math.max(cursor.getTime(), busy.end.getTime()));
      }

      const dayEndDate = dayjs(days[dayIdx]).endOf('day').toDate();
      if (cursor.getTime() < dayEndDate.getTime()) {
        zones.push({ start: cursor, end: dayEndDate });
      }

      return zones;
    });
  }, [daysBusy, days]);

  const initialColumnIndex = useMemo(() => {
    const startDay = dayjs(initialStart).startOf('day');
    return days.findIndex((d) => dayjs(d).startOf('day').isSame(startDay));
  }, [days, initialStart]);

  const brickTopPct = useMemo(() => {
    const startMin = initialStart.getHours() * 60 + initialStart.getMinutes();
    return (startMin / (24 * 60)) * 100;
  }, [initialStart]);

  const brickHeightPct = useMemo(() => {
    const durationMin = durationMs / 60_000;
    return (durationMin / (24 * 60)) * 100;
  }, [durationMs]);

  const gridHeight = hourRowHeight * 24;
  const totalWidth = columnWidth * days.length;
  const headerScrollRef = useRef<ScrollView>(null);
  const gridScrollRef = useRef<ScrollView>(null);
  const syncingScroll = useRef(false);

  const handleCommit = useCallback((start: Date, end: Date) => {
    onApplySlot({ start, end });
  }, [onApplySlot]);

  const { panHandlers, translateY, translateX, isFree } = useSlotDrag({
    initialStart,
    durationMs,
    hourRowHeight,
    columnWidth,
    daysCount: days.length,
    initialColumnIndex: Math.max(0, initialColumnIndex),
    mergedBusy,
    onCommit: handleCommit,
    onReject: () => {},
  });

  useEffect(() => {
    const offset = Math.max(0, (initialColumnIndex - 1) * columnWidth);
    headerScrollRef.current?.scrollTo({ x: offset, animated: false });
    gridScrollRef.current?.scrollTo({ x: offset, animated: false });
  }, [initialColumnIndex, columnWidth]);

  const syncHorizontalScroll = (x: number, source: 'header' | 'grid') => {
    if (syncingScroll.current) return;
    syncingScroll.current = true;
    if (source === 'header') gridScrollRef.current?.scrollTo({ x, animated: false });
    else headerScrollRef.current?.scrollTo({ x, animated: false });
    syncingScroll.current = false;
  };

  const handleFreeZoneLongPress = (zone: { start: Date; end: Date }, event: GestureResponderEvent) => {
    const offsetMinutes = Math.max(
      0,
      Math.round((event.nativeEvent.locationY / hourRowHeight) * 4) * 15,
    );
    const start = new Date(zone.start.getTime() + offsetMinutes * 60_000);
    const end = new Date(start.getTime() + durationMs);
    if (end.getTime() <= zone.end.getTime()) {
      onApplySlot({ start, end });
    }
  };

  const brickStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
    ],
  }));

  const brickBorderStyle = useAnimatedStyle(() => ({
    borderWidth: 2,
    borderColor: isFree.value ? FREE_COLOR : theme.colors.danger,
  }));

  return (
    <View style={styles.container}>
      {/* Day headers */}
      <View style={styles.dayHeadersRow}>
        <View style={{ width: HOUR_RAIL_WIDTH }} />
        <ScrollView
          ref={headerScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(event) => syncHorizontalScroll(event.nativeEvent.contentOffset.x, 'header')}
          style={styles.horizontalViewport}
        >
          <View style={[styles.headerContent, { width: totalWidth }]}>
            {days.map((day, i) => {
              const isInitial = dayjs(day).isSame(dayjs(initialStart).startOf('day'));
              return (
                <View key={`header-${i}`} style={[styles.dayHeader, { width: columnWidth }]}>
                  <Typography
                    variant="caption"
                    weight={isInitial ? '700' : '400'}
                    color={isInitial ? 'primary' : 'secondary'}
                    align="center"
                  >
                    {dayjs(day).format('ddd')}
                  </Typography>
                  <Typography
                    variant="caption"
                    weight={isInitial ? '700' : '400'}
                    color={isInitial ? 'primary' : 'secondary'}
                    align="center"
                  >
                    {dayjs(day).format('D/M')}
                  </Typography>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {/* Timeline grid */}
      <View style={[styles.gridRow, { height: gridHeight }]}>
        <HourRail />
        <ScrollView
          ref={gridScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(event) => syncHorizontalScroll(event.nativeEvent.contentOffset.x, 'grid')}
          style={styles.horizontalViewport}
        >
          <View style={[styles.columnsContainer, { width: totalWidth, height: gridHeight }]}>
                {days.map((day, dayIdx) => (
                  <View key={`col-${dayIdx}`} style={[styles.gridColumn, { width: columnWidth }]}>
                    <GridLines />

                    {/* Free zones */}
                    {daysFreeZones[dayIdx].map((zone, i) => {
                      const topPct = ((zone.start.getHours() * 60 + zone.start.getMinutes()) / (24 * 60)) * 100;
                      const durationMin = (zone.end.getTime() - zone.start.getTime()) / 60_000;
                      const heightPct = (durationMin / (24 * 60)) * 100;
                      return (
                        <Pressable
                          key={`free-${dayIdx}-${i}`}
                          testID={`free-zone-${dayIdx}-${i}`}
                          delayLongPress={300}
                          onLongPress={(event) => handleFreeZoneLongPress(zone, event)}
                          style={[
                            styles.freeZone,
                            {
                              top: `${topPct}%`,
                              height: `${heightPct}%`,
                              backgroundColor: `${FREE_COLOR}${Math.round(FREE_BG_ALPHA * 255).toString(16).padStart(2, '0')}`,
                            },
                          ]}
                        />
                      );
                    })}

                    {/* Busy blocks */}
                    {daysBusy[dayIdx].map((busy, i) => {
                      const startMin = busy.start.getHours() * 60 + busy.start.getMinutes();
                      const durationMin = (busy.end.getTime() - busy.start.getTime()) / 60_000;
                      const topPct = (startMin / (24 * 60)) * 100;
                      const heightPct = (durationMin / (24 * 60)) * 100;
                      const isUnavailable = busy.fbType === 'BUSY-UNAVAILABLE';
                      return (
                        <View
                          key={`busy-${dayIdx}-${i}`}
                          testID={`busy-block-${dayIdx}-${i}`}
                          pointerEvents="none"
                          style={[
                            styles.busyBlock,
                            {
                              top: `${topPct}%`,
                              height: `${heightPct}%`,
                              backgroundColor: isUnavailable
                                ? `${BUSY_UNAVAILABLE_PATTERN}30`
                                : `${theme.colors.danger}30`,
                              borderTopWidth: 1,
                              borderBottomWidth: 1,
                              borderColor: isUnavailable ? BUSY_UNAVAILABLE_PATTERN : theme.colors.danger,
                              borderStyle: isUnavailable ? 'dashed' : 'solid',
                            },
                          ]}
                        >
                          {!isUnavailable && durationMin >= 30 && (
                            <Typography variant="caption" color="danger" style={styles.busyLabel}>
                              {t('event.findTimeTimelineBusy')}
                            </Typography>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ))}

                {/* Event brick (draggable ghost) */}
                <Animated.View
                  testID="event-brick"
                  style={[
                    styles.brick,
                    {
                      top: `${brickTopPct}%`,
                      height: `${brickHeightPct}%`,
                      width: columnWidth - 8,
                      left: initialColumnIndex * columnWidth + 4,
                      backgroundColor: theme.colors.primary,
                    },
                    brickStyle,
                    brickBorderStyle,
                  ]}
                >
                  <Typography
                    variant="caption"
                    weight="600"
                    color="light"
                    numberOfLines={1}
                    style={styles.brickTitle}
                  >
                    {eventTitle || t('event.findTimeTimelineEvent')}
                  </Typography>
                  <View
                    testID="event-brick-drag-handle"
                    {...panHandlers}
                    accessible
                    accessibilityRole="adjustable"
                    accessibilityLabel={t('event.findTimeTimelineDragHint')}
                    style={styles.dragHandle}
                  >
                    <GripVertical size={16} color={theme.colors.primaryText} />
                  </View>
                </Animated.View>
              </View>
        </ScrollView>
      </View>

      {/* Drag hint */}
      <Typography variant="caption" color="secondary" style={styles.hint}>
        {t('event.findTimeTimelineDragHint')}
      </Typography>
    </View>
  );
}

export const AvailabilityTimeline = memo(AvailabilityTimelineImpl);

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  dayHeadersRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  horizontalViewport: {
    flex: 1,
  },
  headerContent: {
    flexDirection: 'row',
  },
  dayHeader: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  gridRow: {
    flexDirection: 'row',
  },
  columnsContainer: {
    flex: 1,
    flexDirection: 'row',
    position: 'relative',
  },
  gridColumn: {
    position: 'relative',
    overflow: 'hidden',
  },
  freeZone: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  busyBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    justifyContent: 'center',
    paddingLeft: 4,
  },
  busyLabel: {
    fontSize: 9,
    opacity: 0.7,
  },
  brick: {
    position: 'absolute',
    borderRadius: 6,
    paddingLeft: 6,
    paddingRight: 2,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 100,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  brickTitle: {
    flex: 1,
    fontSize: 10,
  },
  dragHandle: {
    width: 28,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    textAlign: 'center',
    opacity: 0.6,
    fontSize: 11,
  },
});
