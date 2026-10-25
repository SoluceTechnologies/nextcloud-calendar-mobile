import { memo, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import dayjs from 'dayjs';
import { Chip } from '@/ui/components';

interface DayStripProps {
  days: Date[];
  selectedDay: Date;
  onSelect: (day: Date) => void;
}

function DayStripImpl({ days, selectedDay, onSelect }: DayStripProps) {
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<number[]>([]);
  const [scrollWidth, setScrollWidth] = useState(0);

  // Keep the selected day chip visible.
  useEffect(() => {
    const index = days.findIndex((d) => dayjs(d).isSame(dayjs(selectedDay), 'day'));
    const x = offsets.current[index];
    if (index < 0 || x === undefined || scrollWidth === 0) return;
    const target = Math.max(0, x - scrollWidth / 2 + 60);
    scrollRef.current?.scrollTo({ x: target, animated: true });
  }, [days, selectedDay, scrollWidth]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      contentContainerStyle={styles.row}
      onLayout={(e) => setScrollWidth(e.nativeEvent.layout.width)}
    >
      {days.map((day, i) => {
        const selected = dayjs(day).isSame(dayjs(selectedDay), 'day');
        return (
          <View
            key={i}
            testID={`day-strip-${i}`}
            onLayout={(e) => {
              offsets.current[i] = e.nativeEvent.layout.x;
            }}
          >
            <Chip small rounded active={selected} onPress={() => onSelect(day)}>
              {dayjs(day).format('ddd D')}
            </Chip>
          </View>
        );
      })}
    </ScrollView>
  );
}

export const DayStrip = memo(DayStripImpl);

const styles = StyleSheet.create({
  // A horizontal ScrollView inside a column flex parent can be stretched to the
  // leftover space; cap it so it only takes its content height.
  strip: {
    flexGrow: 0,
    flexShrink: 0,
    maxHeight: 64,
  },
  row: {
    gap: 8,
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
});
