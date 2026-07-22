import { View, ScrollView, Alert, Modal, Linking, Image } from 'react-native';
import { useDeferredValue, useState, useEffect, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { useRouter, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CircleQuestionMark, Bug } from 'lucide-react-native';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { deleteAccount, setActiveAccountId, clearActiveAccountId } from '@/services/nextcloud/auth';
import { useAccounts, refreshAccounts } from '@/hooks/useAccounts';
import { ClearDatabaseForAccount } from '@/database/DatabaseProvider';
import { storage } from '@/storage';
import { useAccountStore } from '@/stores/accountStore';
import { useCalendarStore } from '@/stores/calendarStore';
import { useSettingsStore, type ThemePreference } from '@/stores/settingsStore';
import { AccountCard } from '@/features/account/components/AccountCard';
import { LanguageSheet } from '@/components/LanguageSheet';
import {
  ViewContainer, Stack, Typography, Chip, Button, Icon, IconButton, Spinner, AnimatedPressable, Accordion, Dialog,
} from '@/ui/components';

const GITHUB_URL = 'https://github.com/SoluceTechnologies/nextcloud-calendar-mobile';
const ISSUES_URL = 'https://github.com/SoluceTechnologies/nextcloud-calendar-mobile/issues/new';
const DEFAULT_ZOOM = 60;

const THEME_VALUES: ThemePreference[] = ['system', 'light', 'dark'];
const THEME_LABEL_KEY: Record<ThemePreference, string> = {
  system: 'settings.themeSystem',
  light: 'settings.themeLight',
  dark: 'settings.themeDark',
};

export default function SettingsScreen() {
  const router = useRouter();
  const [aboutVisible, setAboutVisible] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(true);
  const appVersion = Constants.expoConfig?.version ?? '—';
  const { t } = useTranslation();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const setStoreId = useAccountStore((s) => s.setActiveAccountId);
  const themePreference = useSettingsStore((s) => s.themePreference);
  const setThemePreference = useSettingsStore((s) => s.setThemePreference);
  const hourRowHeight = useCalendarStore((s) => s.hourRowHeight);
  const setHourRowHeight = useCalendarStore((s) => s.setHourRowHeight);
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const setWeekStartsOn = useSettingsStore((s) => s.setWeekStartsOn);

  const [pendingTheme, setPendingTheme] = useState(themePreference);
  const [pendingWeek, setPendingWeek] = useState(weekStartsOn);
  useEffect(() => { setPendingTheme(themePreference); }, [themePreference]);
  useEffect(() => { setPendingWeek(weekStartsOn); }, [weekStartsOn]);

  useFocusEffect(
    useCallback(() => () => {
      setAppearanceOpen(false);
      setAccountsOpen(true);
    }, [])
  );

  const deferredThemePref = useDeferredValue(themePreference);
  const themeSwitching = themePreference !== deferredThemePref;

  const zoomLabel =
    hourRowHeight <= 45 ? t('settings.zoom.compact')
    : hourRowHeight <= 75 ? t('settings.zoom.normal')
    : hourRowHeight <= 120 ? t('settings.zoom.expanded')
    : t('settings.zoom.large');

  const tabBarHeight = useBottomTabBarHeight();

  const accounts = useAccounts();

  async function handleSetActive(id: string) {
    await setActiveAccountId(id);
    setStoreId(id);
  }

  function handleDelete(id: string, displayName: string) {
    Alert.alert(t('settings.removeTitle'), t('settings.removeMsg', { name: displayName }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'), style: 'destructive',
        onPress: async () => {
          await deleteAccount(id);
          await ClearDatabaseForAccount(id).catch(() => undefined);
          storage.remove(`avatar:${id}`);
          const remaining = await refreshAccounts();
          if (activeAccountId === id) {
            const next = remaining[0]?.id ?? null;
            if (next) {
              await setActiveAccountId(next);
              setStoreId(next);
            } else {
              await clearActiveAccountId();
              setStoreId(null);
              router.replace('/(auth)/setup');
            }
          }
        },
      },
    ]);
  }

  return (
    <ViewContainer centered>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <Stack direction="horizontal" vAlign="center" padding={[16, 12]}>
          <Typography variant="h2">{t('settings.title')}</Typography>
          <AnimatedPressable onPress={() => setAboutVisible(true)} hitSlop={8} style={{ marginLeft: 'auto' }}>
            <Icon size={26}><CircleQuestionMark /></Icon>
          </AnimatedPressable>
        </Stack>

        <Dialog visible={aboutVisible} onClose={() => setAboutVisible(false)}>
          <Image source={require('../../../assets/icon.png')} style={{ width: 72, height: 72, borderRadius: 16 }} />
          <Typography variant="title">{t('settings.about.name')}</Typography>
          <Typography variant="caption" color="secondary">{t('settings.version', { version: appVersion })}</Typography>
          <Typography variant="caption" color="secondary" align="center">{t('settings.about.description')}</Typography>
          <Button
            variant="primary" title={t('settings.about.github')}
            icon={<Icon size={18}><Ionicons name="logo-github" color="#fff" /></Icon>}
            onPress={() => Linking.openURL(GITHUB_URL)}
          />
          <Button
            variant="secondary" color="text" title={t('settings.about.reportBug')}
            icon={<Icon size={18}><Bug /></Icon>}
            onPress={() => Linking.openURL(ISSUES_URL)}
          />
          <Button variant="link" color="text" title={t('common.close')} onPress={() => setAboutVisible(false)} />
        </Dialog>

        <ScrollView contentContainerStyle={{ paddingBottom: tabBarHeight + 16, paddingTop: 8 }} keyboardShouldPersistTaps="handled">
          <Accordion title={t('settings.appearance')} open={appearanceOpen} onToggle={() => setAppearanceOpen((o) => !o)}>
            <Stack card gap={12} padding={16} hAlign="stretch" style={cardOuter}>
              <Typography variant="body1">{t('settings.theme')}</Typography>
              <Stack direction="horizontal" gap={8}>
                {THEME_VALUES.map((value) => (
                  <Chip
                    key={value}
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

            <Stack card gap={12} padding={16} hAlign="stretch" style={cardOuter}>
              <Typography variant="body1">{t('settings.weekStart')}</Typography>
              <Stack direction="horizontal" gap={8}>
                {([
                  { labelKey: 'settings.sunday', value: 0 },
                  { labelKey: 'settings.monday', value: 1 },
                ] as const).map((opt) => (
                  <Chip
                    key={String(opt.value)}
                    fullWidth
                    active={pendingWeek === opt.value}
                    onPress={() => { setPendingWeek(opt.value); setWeekStartsOn(opt.value); }}
                  >
                    {t(opt.labelKey)}
                  </Chip>
                ))}
              </Stack>
            </Stack>

            <Stack card gap={12} padding={16} hAlign="stretch" style={cardOuter}>
              <Typography variant="body1">{t('settings.calendarZoom')}</Typography>
              <Stack direction="horizontal" vAlign="center" gap={12}>
                <IconButton disabled={hourRowHeight <= 30} onPress={() => setHourRowHeight(Math.max(hourRowHeight - 15, 30))}>
                  <Typography variant="h4" color="text">−</Typography>
                </IconButton>
                <Typography variant="body2" color="secondary" style={{ flex: 1, textAlign: 'center' }}>{zoomLabel}</Typography>
                <IconButton disabled={hourRowHeight >= 200} onPress={() => setHourRowHeight(Math.min(hourRowHeight + 15, 200))}>
                  <Typography variant="h4" color="text">+</Typography>
                </IconButton>
              </Stack>
              <Button
                variant="link" size="small" alignment="start" color="primary"
                title={t('settings.reset')}
                disabled={hourRowHeight === DEFAULT_ZOOM}
                onPress={() => setHourRowHeight(DEFAULT_ZOOM)}
              />
            </Stack>
          </Accordion>

          <Accordion title={t('settings.accounts')} open={accountsOpen} onToggle={() => setAccountsOpen((o) => !o)}>
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                isActive={account.id === activeAccountId}
                onSetActive={() => handleSetActive(account.id)}
                onDelete={() => handleDelete(account.id, account.displayName)}
              />
            ))}
            <Stack padding={[16, 8]}>
              <Button variant="ghost" dashed title={t('settings.addAccount')} onPress={() => router.push('/(auth)/setup')} />
            </Stack>
          </Accordion>
        </ScrollView>
      </SafeAreaView>
    </ViewContainer>
  );
}

const cardOuter = { marginHorizontal: 16, marginBottom: 4 };
