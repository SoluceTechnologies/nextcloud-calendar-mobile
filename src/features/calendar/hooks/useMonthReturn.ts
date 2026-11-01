import { useCallback, useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';
import { useIsFocused } from 'expo-router';
import type { ViewMode } from '@/types';

export function useMonthReturn(
  viewMode: ViewMode,
  switchMode: (target: ViewMode, focus?: Date) => void,
) {
  const openedFromMonth = useRef(false);
  const isFocused = useIsFocused();

  const openDay = useCallback((day: Date) => {
    openedFromMonth.current = true;
    switchMode('day', day);
  }, [switchMode]);

  useEffect(() => {
    if (viewMode !== 'day') {
      openedFromMonth.current = false;
      return;
    }
    if (!openedFromMonth.current || !isFocused) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      switchMode('month');
      return true;
    });
    return () => subscription.remove();
  }, [viewMode, switchMode, isFocused]);

  return { openDay };
}
