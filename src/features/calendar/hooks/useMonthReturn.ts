import { useCallback, useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';
import { useIsFocused } from 'expo-router';
import type { ViewMode } from '@/types';

// A Day view opened by tapping a month cell sends Android hardware back to
// Month, like Google Calendar. Any other way into Day keeps the default back.
export function useMonthReturn(
  viewMode: ViewMode,
  switchMode: (target: ViewMode, focus?: Date) => void,
) {
  const fromMonth = useRef(false);
  // Another screen on top (event details, settings tab) owns back while it is open.
  const focused = useIsFocused();

  const openDay = useCallback((d: Date) => {
    fromMonth.current = true;
    switchMode('day', d);
  }, [switchMode]);

  useEffect(() => {
    if (viewMode !== 'day') {
      fromMonth.current = false;
      return;
    }
    if (!fromMonth.current || !focused) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      switchMode('month');
      return true;
    });
    return () => sub.remove();
  }, [viewMode, switchMode, focused]);

  return { openDay };
}
