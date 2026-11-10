import type { TextStyle } from 'react-native';
import { DefaultTheme } from 'expo-router';

export type ColorScheme = 'light' | 'dark';

export interface ThemeFontStyle {
  fontFamily: string;
  fontWeight: TextStyle['fontWeight'];
}

export interface ThemeFonts {
  regular: ThemeFontStyle;
  medium: ThemeFontStyle;
  bold: ThemeFontStyle;
  heavy: ThemeFontStyle;
}

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceRaised: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  borderSubtle: string;
  primary: string;
  primaryText: string;
  talk: string;
  danger: string;
  warning: string;
  success: string;
  tabBar: string;
  tabBarBorder: string;
  tabBarInactive: string;
  headerBackground: string;
  chip: string;
  chipActive: string;
  card: string;
  notification: string;
  item: string;
}

export interface ThemeSpacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

export interface ThemeRadius {
  sm: number;
  md: number;
  lg: number;
  pill: number;
}

export interface ThemeTypography {
  caption: number;
  body: number;
  title: number;
  heading: number;
}

export interface Theme {
  dark: boolean;
  colors: ThemeColors;
  fonts: ThemeFonts;
  spacing: ThemeSpacing;
  radius: ThemeRadius;
  typography: ThemeTypography;
}


declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface Theme {
      dark: boolean;
      colors: ThemeColors;
      fonts: ThemeFonts;
      spacing: ThemeSpacing;
      radius: ThemeRadius;
      typography: ThemeTypography;
    }
  }
}

const spacing: ThemeSpacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
const radius: ThemeRadius = { sm: 8, md: 12, lg: 16, pill: 999 };
const typography: ThemeTypography = { caption: 13, body: 15, title: 17, heading: 22 };
const fonts: ThemeFonts = DefaultTheme.fonts;

const lightColors: ThemeColors = {
  background: '#ffffff',
  surface: '#f5f5f5',
  surfaceRaised: '#ffffff',
  text: '#1a1a1a',
  textSecondary: '#555555',
  textTertiary: '#888888',
  border: '#eeeeee',
  borderSubtle: '#f5f5f5',
  primary: '#109be6',
  primaryText: '#ffffff',
  talk: '#0082c9',
  danger: '#d32f2f',
  warning: '#f57c00',
  success: '#43a047',
  tabBar: '#ffffff',
  tabBarBorder: '#e0e0e0',
  tabBarInactive: '#8e8e93',
  headerBackground: '#ffffff',
  chip: '#f0f0f0',
  chipActive: '#109be6',
  card: '#ffffff',
  notification: '#d32f2f',
  item: '#f7f7f7',
};

const darkColors: ThemeColors = {
  background: '#121212',
  surface: '#1e1e1e',
  surfaceRaised: '#2a2a2a',
  text: '#f1f1f1',
  textSecondary: '#aaaaaa',
  textTertiary: '#666666',
  border: '#333333',
  borderSubtle: '#242424',
  primary: '#29aef7',
  primaryText: '#ffffff',
  talk: '#29b6f6',
  danger: '#ef5350',
  warning: '#ffa726',
  success: '#66bb6a',
  tabBar: '#1c1c1e',
  tabBarBorder: '#2c2c2e',
  tabBarInactive: '#636366',
  headerBackground: '#1c1c1e',
  chip: '#2c2c2e',
  chipActive: '#29aef7',
  card: '#1c1c1e',
  notification: '#ef5350',
  item: '#1e1e1e',
};

export const lightTheme: Theme = { dark: false, colors: lightColors, fonts, spacing, radius, typography };
export const darkTheme: Theme = { dark: true, colors: darkColors, fonts, spacing, radius, typography };
