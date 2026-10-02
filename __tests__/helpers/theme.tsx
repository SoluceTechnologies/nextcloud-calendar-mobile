import React from 'react';
import { ThemeProvider } from 'expo-router';
import { lightTheme } from '../../src/theme';

export function ThemeWrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider value={lightTheme}>{children}</ThemeProvider>;
}
