import { useTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback, useEffect } from 'react';
import { Dimensions, View, useWindowDimensions } from 'react-native';
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

// Recomputed on every window resize: an app opened on the phone and later
// docked to Samsung DeX (or split-screen) must drop the portrait lock,
// otherwise the freeform window stays pinned to a phone aspect ratio.
function useOrientationLock() {
  const { width, height } = useWindowDimensions();
  useEffect(() => {
    ScreenOrientation.lockAsync(
      shouldLockPortrait({ width, height }, Dimensions.get('screen'))
        ? ScreenOrientation.OrientationLock.PORTRAIT_UP
        : ScreenOrientation.OrientationLock.DEFAULT,
    ).catch(() => undefined);
  }, [width, height]);
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
