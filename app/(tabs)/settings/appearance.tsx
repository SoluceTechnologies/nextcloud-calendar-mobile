import { useDeferredValue, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useSettingsStore, type ThemePreference } from '@/stores/settingsStore';
import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { LanguageSheet } from '@/components/LanguageSheet';
import { Chip, Spinner, Stack, Typography } from '@/ui/components';

const cardOuter = { marginHorizontal: 16, marginBottom: 12 };

const THEME_VALUES: ThemePreference[] = ['system', 'light', 'dark'];
const THEME_LABEL_KEY: Record<ThemePreference, string> = {
  system: 'settings.themeSystem',
  light: 'settings.themeLight',
  dark: 'settings.themeDark',
};

export default function AppearanceSettingsScreen() {
  const { t } = useTranslation();
  const themePreference = useSettingsStore((s) => s.themePreference);
  const setThemePreference = useSettingsStore((s) => s.setThemePreference);

  const [pendingTheme, setPendingTheme] = useState(themePreference);
  useEffect(() => { setPendingTheme(themePreference); }, [themePreference]);

  const deferredThemePref = useDeferredValue(themePreference);
  const themeSwitching = themePreference !== deferredThemePref;

  return (
    <SettingsPage title={t('settings.appearance')}>
      <Stack card gap={12} padding={16} hAlign="stretch" style={cardOuter}>
        <Typography variant="body1">{t('settings.theme')}</Typography>
        <Stack direction="horizontal" gap={8}>
          {THEME_VALUES.map((value) => (
            <Chip
              key={value}
              testID={`settings-theme-${value}`}
              fullWidth
              active={pendingTheme === value}
              onPress={() => { setPendingTheme(value); setThemePreference(value); }}
            >
              {themeSwitching && pendingTheme === value
                ? <Spinner color="text" />
                : t(THEME_LABEL_KEY[value])}
            </Chip>
          ))}
        </Stack>
      </Stack>

      <Stack card gap={12} padding={16} hAlign="stretch" style={cardOuter}>
        <Typography variant="body1">{t('common.language')}</Typography>
        <LanguageSheet />
      </Stack>
    </SettingsPage>
  );
}
