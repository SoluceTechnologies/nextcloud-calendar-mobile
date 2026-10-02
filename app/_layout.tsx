import { useTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, View, useWindowDimensions, type ScaledSize } from 'react-native';
import { Providers } from '@/components/Providers';
import { RootNavigator } from '@/components/RootNavigator';
import FakeSplash from '@/components/FakeSplash';
import { useAppInitialization } from '@/hooks/useAppInitialization';
import '@/utils/i18n';
import { useCapabilitiesSync } from '@/hooks/useCapabilitiesSync';
import { useLanguageSync } from '@/hooks/useLanguageSync';
import { useWidgetSync } from '@/features/widget';
import { useEventAlerts } from '@/features/notifications/useEventAlerts';
import { useContactCache } from '@/hooks/useContactCache';
import { shouldLockPortrait } from '@/utils/device';

function useScreenDimensions(): ScaledSize {
  const [screen, setScreen] = useState(() => Dimensions.get('screen'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ screen: next }) =>
      setScreen(next),
    );
    return () => sub.remove();
  }, []);
  return screen;
}

function useOrientationLock() {
  const { width, height } = useWindowDimensions();
  const screen = useScreenDimensions();
  const lock = shouldLockPortrait({ width, height }, screen);
  const applied = useRef<boolean | null>(null);
  useEffect(() => {
    if (applied.current === lock) return;
    applied.current = lock;
    ScreenOrientation.lockAsync(
      lock
        ? ScreenOrientation.OrientationLock.PORTRAIT_UP
        : ScreenOrientation.OrientationLock.DEFAULT,
    ).catch(() => undefined);
  }, [lock]);
}

function ThemedStatusBar() {
  const { dark } = useTheme();
  return <StatusBar style={dark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  const { isAppReady } = useAppInitialization();
  useCapabilitiesSync();
  useLanguageSync();
  useOrientationLock();
  useWidgetSync();
  useEventAlerts();
  useContactCache();

  const onLayoutRootView = useCallback(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  return (
    <Providers>
      <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
        <ThemedStatusBar />
        {isAppReady ? <RootNavigator /> : <FakeSplash />}
      </View>
    </Providers>
  );
}
