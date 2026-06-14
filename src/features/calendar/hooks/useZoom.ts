import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Gesture } from 'react-native-gesture-handler';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import { useAppStore } from '@/store/appStore';

const MIN_HOUR_ROW = 30;
const MAX_HOUR_ROW = 200;


export function useZoom() {
  const hourRowHeight = useAppStore((s) => s.hourRowHeight);
  const setHourRowHeight = useAppStore((s) => s.setHourRowHeight);

  const [calendarKey, setCalendarKey] = useState(0);
  const [committedHeight, setCommittedHeight] = useState(hourRowHeight);

  useFocusEffect(useCallback(() => {
    if (committedHeight !== hourRowHeight) {
      setCalendarKey((k) => k + 1);
      setCommittedHeight(hourRowHeight);
    }
  }, [hourRowHeight, committedHeight]));

  const pendingHeight = useSharedValue(hourRowHeight);
  const pinchBase = useSharedValue(hourRowHeight);

  const commitZoom = useCallback((h: number) => {
    setHourRowHeight(h);
    setCalendarKey((k) => k + 1);
  }, [setHourRowHeight]);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => { pinchBase.value = hourRowHeight; })
        .onUpdate((e) => {
          pendingHeight.value = Math.min(Math.max(Math.round(pinchBase.value * e.scale), MIN_HOUR_ROW), MAX_HOUR_ROW);
        })
        .onEnd(() => { runOnJS(commitZoom)(pendingHeight.value); }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commitZoom]
  );

  return { hourRowHeight, calendarKey, pinchGesture };
}
