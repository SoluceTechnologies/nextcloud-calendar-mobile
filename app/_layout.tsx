import { useTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback } from 'react';
import { View } from 'react-native';
import { Providers } from '@/components/Providers';
import { RootNavigator } from '@/components/RootNavigator';
import FakeSplash from '@/components/FakeSplash';
import { useAppInitialization } from '@/hooks/useAppInitialization';
import '@/utils/i18n';
import { useLanguageSync } from '@/hooks/useLanguageSync';

function ThemedStatusBar() {
  const { dark } = useTheme();
  return <StatusBar style={dark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  const { isAppReady } = useAppInitialization();
  useLanguageSync();

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
