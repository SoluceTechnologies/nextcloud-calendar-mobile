import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Accessibility, Bell, CalendarDays, ChevronRight, Info, LayoutGrid, Palette, UserRound, Video,
} from 'lucide-react-native';

import { useAccountStore } from '@/stores/accountStore';
import { useActiveAccount } from '@/hooks/useAccounts';
import { AvatarImage } from '@/components/AvatarImage';
import { SettingsLink } from '@/features/settings/components/SettingsLink';
import {
  Item, List, ScreenHeader, SectionHeader, Stack, Typography, ViewContainer,
} from '@/ui/components';
import { useTheme } from 'expo-router';

export default function SettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const activeAccount = useActiveAccount(activeAccountId);

  return (
    <ViewContainer>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.column}>
          <ScreenHeader title={t('settings.title')} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          <List>
            <Item
              onPress={() => router.push(
                activeAccountId
                  ? `/(tabs)/settings/account/${activeAccountId}`
                  : '/(tabs)/settings/accounts',
              )}
              leading={activeAccount ? <AvatarImage account={activeAccount} size={44} /> : undefined}
              title={
                <Typography variant="body1" numberOfLines={1} ellipsizeMode="tail">
                  {activeAccount?.displayName ?? activeAccount?.username ?? '—'}
                </Typography>
              }
              description={
                <Typography variant="caption" color="secondary" numberOfLines={1} ellipsizeMode="middle">
                  {activeAccount?.username ?? ''}
                </Typography>
              }
              trailing={<ChevronRight size={20} color={colors.textTertiary} />}
            />
          </List>

          <Stack style={styles.section} hAlign="stretch">
            <SectionHeader title={t('settings.sections.general')} />
            <List>
              <SettingsLink
                title={t('settings.appearance')}
                icon={<Palette />}
                onPress={() => router.push('/(tabs)/settings/appearance')}
              />
              <SettingsLink
                title={t('settings.calendar')}
                icon={<CalendarDays />}
                onPress={() => router.push('/(tabs)/settings/calendar')}
              />
              <SettingsLink
                title={t('settings.accessibility.title')}
                icon={<Accessibility />}
                onPress={() => router.push('/(tabs)/settings/accessibility')}
              />
              <SettingsLink
                title={t('settings.talk.title')}
                icon={<Video />}
                onPress={() => router.push('/(tabs)/settings/talk')}
              />
            </List>
          </Stack>

          <Stack style={styles.section} hAlign="stretch">
            <SectionHeader title={t('settings.sections.alerts')} />
            <List>
              <SettingsLink
                title={t('settings.notifications.title')}
                icon={<Bell />}
                onPress={() => router.push('/(tabs)/settings/notifications')}
              />
              <SettingsLink
                title={t('settings.widgets.title')}
                icon={<LayoutGrid />}
                onPress={() => router.push('/(tabs)/settings/widgets')}
              />
            </List>
          </Stack>

          <Stack style={styles.section} hAlign="stretch">
            <SectionHeader title={t('settings.sections.app')} />
            <List>
              <SettingsLink
                title={t('settings.accounts')}
                icon={<UserRound />}
                onPress={() => router.push('/(tabs)/settings/accounts')}
              />
              <SettingsLink
                title={t('settings.about.title')}
                icon={<Info />}
                onPress={() => router.push('/(tabs)/settings/about')}
              />
            </List>
          </Stack>
        </ScrollView>
      </SafeAreaView>
    </ViewContainer>
  );
}

const MAX_CONTENT_WIDTH = 700;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  section: { marginTop: 24 },
});
