import { View, Text, TouchableOpacity, Pressable, ScrollView, Alert, Modal, Linking, Image } from 'react-native';
import { startTransition, useState, useEffect } from 'react';
import { styles } from '@/styles/settingsScreen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { loadAccounts, deleteAccount, setActiveAccountId, clearActiveAccountId } from '@/api/auth';
import { useAppStore, type ThemePreference } from '@/store/appStore';
import { useTheme } from '@/hooks/useTheme';
import { AccountCard } from '@/components/AccountCard';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';

const GITHUB_URL = 'https://github.com/SoluceTechnologies/nextcloud-calendar-mobile';
const ISSUES_URL = 'https://github.com/SoluceTechnologies/nextcloud-calendar-mobile/issues/new';

const THEME_OPTIONS: { label: string; value: ThemePreference }[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const [aboutVisible, setAboutVisible] = useState(false);
  const appVersion = Constants.expoConfig?.version ?? '—';
  const queryClient = useQueryClient();
  const theme = useTheme();
  const activeAccountId = useAppStore((s) => s.activeAccountId);
  const setStoreId = useAppStore((s) => s.setActiveAccountId);
  const themePreference = useAppStore((s) => s.themePreference);
  const setThemePreference = useAppStore((s) => s.setThemePreference);
  const hourRowHeight = useAppStore((s) => s.hourRowHeight);
  const setHourRowHeight = useAppStore((s) => s.setHourRowHeight);
  const weekStartsOn = useAppStore((s) => s.weekStartsOn);
  const setWeekStartsOn = useAppStore((s) => s.setWeekStartsOn);

  const [pendingTheme, setPendingTheme] = useState(themePreference);
  const [pendingWeek, setPendingWeek] = useState(weekStartsOn);
  useEffect(() => { setPendingTheme(themePreference); }, [themePreference]);
  useEffect(() => { setPendingWeek(weekStartsOn); }, [weekStartsOn]);

  const DEFAULT_ZOOM = 60;
  const zoomLabel = hourRowHeight <= 45 ? 'Compact' : hourRowHeight <= 75 ? 'Normal' : hourRowHeight <= 120 ? 'Expanded' : 'Large';

  const tabBarHeight = useBottomTabBarHeight();

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: loadAccounts,
  });

  async function handleSetActive(id: string) {
    await setActiveAccountId(id);
    setStoreId(id);
    queryClient.invalidateQueries({ queryKey: [id] });
  }

  function handleDelete(id: string, displayName: string) {
    Alert.alert('Remove Account', `Remove "${displayName}" from this device?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await deleteAccount(id);
          const remaining = accounts.filter((a) => a.id !== id);
          queryClient.setQueryData(['accounts'], remaining);
          queryClient.removeQueries({ queryKey: [id] });
          queryClient.removeQueries({ queryKey: ['avatar', id] });
          if (activeAccountId === id) {
            const next = remaining[0]?.id ?? null;
            if (next) {
              await setActiveAccountId(next);
              setStoreId(next);
            } else {
              await clearActiveAccountId();
              setStoreId(null);
              router.replace('/(auth)/setup');
              return;
            }
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.pageHeader]}>
        <Text style={[styles.pageTitle, { color: theme.text }]}>Settings</Text>
        <TouchableOpacity onPress={() => setAboutVisible(true)} hitSlop={8}>
          <Ionicons name="help-circle-outline" size={26} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <Modal visible={aboutVisible} transparent animationType="fade" onRequestClose={() => setAboutVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAboutVisible(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => {}}>
            <Image source={require('../../../assets/icon.png')} style={styles.appIcon} />
            <Text style={[styles.modalAppName, { color: theme.text }]}>Nextcloud Calendar</Text>
            <Text style={[styles.modalVersion, { color: theme.textSecondary }]}>v{appVersion}</Text>
            <Text style={[styles.modalDescription, { color: theme.textSecondary }]}>
              An open-source mobile calendar app for Nextcloud.
            </Text>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: theme.chipActive, borderColor: theme.primary }]}
              onPress={() => Linking.openURL(GITHUB_URL)}
            >
              <Ionicons name="logo-github" size={18} color={theme.primaryText} />
              <Text style={[styles.modalBtnText, { color: theme.primaryText }]}>View on GitHub</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: theme.chip, borderColor: theme.border }]}
              onPress={() => Linking.openURL(ISSUES_URL)}
            >
              <Ionicons name="bug-outline" size={18} color={theme.text} />
              <Text style={[styles.modalBtnText, { color: theme.text }]}>Report a Bug</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setAboutVisible(false)} style={styles.modalClose}>
              <Text style={[styles.modalCloseText, { color: theme.textTertiary }]}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView contentContainerStyle={{ paddingBottom: tabBarHeight + 16 }} keyboardShouldPersistTaps="handled">
        <Text style={[styles.sectionHeader, { color: theme.textTertiary }]}>Appearance</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardLabel, { color: theme.text }]}>Theme</Text>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.themeChip,
                  { backgroundColor: theme.chip, borderColor: theme.border },
                  pendingTheme === opt.value && {
                    backgroundColor: theme.chipActive,
                    borderColor: theme.primary,
                  },
                ]}
                onPress={() => {
                  setPendingTheme(opt.value);
                  startTransition(() => setThemePreference(opt.value));
                }}
              >
                <Text
                  style={[
                    styles.themeChipText,
                    { color: theme.textSecondary },
                    pendingTheme === opt.value && { color: theme.primaryText, fontWeight: '600' },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardLabel, { color: theme.text }]}>Week Starts On</Text>
          <View style={styles.themeRow}>
            {([
              { label: 'Sunday', value: 0 },
              { label: 'Monday', value: 1 },
            ] as const).map((opt) => (
              <TouchableOpacity
                key={String(opt.value)}
                style={[
                  styles.themeChip,
                  { backgroundColor: theme.chip, borderColor: theme.border },
                  pendingWeek === opt.value && {
                    backgroundColor: theme.chipActive,
                    borderColor: theme.primary,
                  },
                ]}
                onPress={() => {
                  setPendingWeek(opt.value);
                  startTransition(() => setWeekStartsOn(opt.value));
                }}
              >
                <Text
                  style={[
                    styles.themeChipText,
                    { color: theme.textSecondary },
                    pendingWeek === opt.value && { color: theme.primaryText, fontWeight: '600' },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.zoomHeader}>
            <Text style={[styles.cardLabel, { color: theme.text, marginBottom: 0 }]}>Calendar Zoom</Text>
            <TouchableOpacity onPress={() => setHourRowHeight(DEFAULT_ZOOM)} disabled={hourRowHeight === DEFAULT_ZOOM}>
              <Text style={[styles.resetText, { color: hourRowHeight === DEFAULT_ZOOM ? theme.textTertiary : theme.primary }]}>Reset</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.zoomRow}>
            <TouchableOpacity
              style={[styles.zoomBtn, { backgroundColor: theme.chip, borderColor: theme.border }]}
              onPress={() => setHourRowHeight(Math.max(hourRowHeight - 15, 30))}
              disabled={hourRowHeight <= 30}
            >
              <Text style={[styles.zoomBtnText, { color: hourRowHeight <= 30 ? theme.textTertiary : theme.text }]}>−</Text>
            </TouchableOpacity>
            <Text style={[styles.zoomLabel, { color: theme.textSecondary }]}>{zoomLabel}</Text>
            <TouchableOpacity
              style={[styles.zoomBtn, { backgroundColor: theme.chip, borderColor: theme.border }]}
              onPress={() => setHourRowHeight(Math.min(hourRowHeight + 15, 200))}
              disabled={hourRowHeight >= 200}
            >
              <Text style={[styles.zoomBtnText, { color: hourRowHeight >= 200 ? theme.textTertiary : theme.text }]}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.sectionHeader, { color: theme.textTertiary }]}>Accounts</Text>
        {accounts.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            isActive={account.id === activeAccountId}
            onSetActive={() => handleSetActive(account.id)}
            onDelete={() => handleDelete(account.id, account.displayName)}
          />
        ))}
        <TouchableOpacity
          style={[styles.addBtn, { borderColor: theme.primary }]}
          onPress={() => router.push('/(auth)/setup')}
        >
          <Text style={[styles.addBtnText, { color: theme.primary }]}>+ Add Account</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

