import { useColorScheme } from "react-native";
import { useAppStore } from "@/store/appStore";
import { lightTheme, darkTheme, type Theme } from "@/theme";

export function getLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const a = [r, g, b].map((v) => {
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });

  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

export function getContrastColor(hex: string): string {
  return getLuminance(hex) > 0.5 ? "#000000" : "#ffffff";
}

export function useTheme(): Theme {
  const systemScheme = useColorScheme();
  const themePreference = useAppStore((s) => s.themePreference);
  const primaryColor = useAppStore((s) => s.primaryColor);
  const primaryText = useAppStore((s) => s.primaryText);

  let resolved =
    themePreference === "system" ? (systemScheme ?? "light") : themePreference;

  if (primaryColor) {
    const lum = getLuminance(primaryColor);
    if (lum > 0.8 && resolved === "light") {
      resolved = "dark";
    } else if (lum < 0.1 && resolved === "dark") {
      resolved = "light";
    }
  }

  const baseTheme = resolved === "dark" ? darkTheme : lightTheme;

  if (!primaryColor) {
    return baseTheme;
  }

  return {
    ...baseTheme,
    primary: primaryColor,
    chipActive: primaryColor,
    talk: primaryColor,
    primaryText: primaryText ?? baseTheme.primaryText,
  };
}
