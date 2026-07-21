import type { ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider } from 'expo-router';
import { DatabaseProvider } from '@/database/DatabaseProvider';
import { useSettingsStore } from '@/stores/settingsStore';
import { lightTheme, darkTheme } from '@/theme';

export function Providers({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const themePreference = useSettingsStore((s) => s.themePreference);
  const resolved =
    themePreference === 'system' ? (systemScheme ?? 'light') : themePreference;
  const theme = resolved === 'dark' ? darkTheme : lightTheme;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <DatabaseProvider>
        <ThemeProvider value={theme}>{children}</ThemeProvider>
      </DatabaseProvider>
    </GestureHandlerRootView>
  );
}
