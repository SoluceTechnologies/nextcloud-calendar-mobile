import { useTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { Providers } from '@/components/Providers';
import { RootNavigator } from '@/components/RootNavigator';
import FakeSplash from '@/components/FakeSplash';
import { useAppInitialization } from '@/hooks/useAppInitialization';
import '@/utils/i18n';
import { useCapabilitiesSync } from '@/hooks/useCapabilitiesSync';
import { useLanguageSync } from '@/hooks/useLanguageSync';
import { useWidgetSync } from '@/features/widget';
import { useEventAlerts } from '@/features/notifications/useEventAlerts';
import { usePushSync } from '@/hooks/usePushSync';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useNotifications } from '@/hooks/useNotifications';
import { useContactCache } from '@/hooks/useContactCache';
import { isTablet } from '@/utils/device';

function useOrientationLock() {
  useEffect(() => {
    ScreenOrientation.lockAsync(
      isTablet()
        ? ScreenOrientation.OrientationLock.DEFAULT
        : ScreenOrientation.OrientationLock.PORTRAIT_UP,
    ).catch(() => undefined);
  }, []);
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
  usePushSync();
  usePushNotifications();
  useNotifications();

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
