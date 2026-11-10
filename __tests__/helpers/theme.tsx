import React from 'react';
import { ThemeProvider } from 'expo-router';
import { darkTheme, lightTheme } from '../../src/theme';

export function ThemeWrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider value={lightTheme}>{children}</ThemeProvider>;
}

export function DarkThemeWrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider value={darkTheme}>{children}</ThemeProvider>;
}
