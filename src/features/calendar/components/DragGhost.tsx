import { memo } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import type { GridEvent } from '../utils/toGridEvents';
import { contrastFor } from '@/utils/colors';

interface Props {
  event: GridEvent;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  height: SharedValue<number>;
  restingHeight: number;
  resizing: boolean;
  width: number;
}

function DragGhostImpl({
  event,
  translateX,
  translateY,
  height,
  restingHeight,
  resizing,
  width,
}: Props) {
  const ink = contrastFor(event.color);

  const style = useAnimatedStyle(() =>
    resizing
      ? {
          height: height.value,
          transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
        }
      : { transform: [{ translateX: translateX.value }, { translateY: translateY.value }] },
  );

  return (
    <Animated.View
      testID="drag-ghost"
      pointerEvents="none"
      style={[
        styles.ghost,
        { width, height: restingHeight, backgroundColor: event.color },
        style,
      ]}
    >
      <Text numberOfLines={1} style={[styles.title, { color: ink.text }]}>
        {event.title}
      </Text>
    </Animated.View>
  );
}

export const DragGhost = memo(DragGhostImpl);

const styles = StyleSheet.create({
  ghost: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 20000,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    justifyContent: 'flex-start',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  title: { fontSize: 12, fontWeight: '600' },
});
