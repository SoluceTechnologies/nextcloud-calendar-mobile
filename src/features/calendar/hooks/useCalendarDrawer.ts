import { useCallback, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { DRAWER_WIDTH } from '../constants';

export function useCalendarDrawer() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const drawerAnimation = useRef<Animated.CompositeAnimation | null>(null);

  const openDrawer = useCallback(() => {
    drawerAnimation.current?.stop();
    setDrawerOpen(true);
    drawerAnimation.current = Animated.parallel([
      Animated.spring(drawerAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200, mass: 0.8 }),
      Animated.timing(overlayAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]);
    drawerAnimation.current.start();
  }, [drawerAnim, overlayAnim]);

  const closeDrawer = useCallback(() => {
    drawerAnimation.current?.stop();
    drawerAnimation.current = Animated.parallel([
      Animated.spring(drawerAnim, { toValue: -DRAWER_WIDTH, useNativeDriver: true, damping: 20, stiffness: 200, mass: 0.8 }),
      Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]);
    drawerAnimation.current.start(({ finished }) => { if (finished) setDrawerOpen(false); });
  }, [drawerAnim, overlayAnim]);

  return { drawerOpen, drawerAnim, overlayAnim, openDrawer, closeDrawer };
}
