import { Animated, ScrollView, StyleSheet, View } from 'react-native';

import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronsUpDown, Inbox, Settings } from 'lucide-react-native';
import { useTheme } from 'expo-router';

import { AvatarImage } from '@/components/AvatarImage';
import { AccountSwitcher } from '@/features/account/components/AccountSwitcher';
import { Item, List, SectionHeader, Stack, Typography } from '@/ui/components';
import type { Account, CalendarMeta } from '@/types';

import { CalendarDrawerRow } from './CalendarDrawerRow';

interface CalendarDrawerProps {
  open: boolean;
  drawerAnim: Animated.Value;
  overlayAnim: Animated.Value;
  drawerWidth: number;
  insets: { top: number };
  activeAccount: Account | null;
  calendars: CalendarMeta[];
  hiddenCalendarIds: string[];
  notifDisabledCalendarIds: string[];
  pendingInvitationsCount: number;
  toggleCalendarVisibility: (id: string) => void;
  toggleCalendarNotifications: (id: string) => void;
  onClose: () => void;
  onNavigateSettings: () => void;
  onNavigateInvitations: () => void;
}

export function CalendarDrawer({
  open,
  drawerAnim,
  overlayAnim,
  drawerWidth,
  insets,
  activeAccount,
  calendars,
  hiddenCalendarIds,
  notifDisabledCalendarIds,
  pendingInvitationsCount,
  toggleCalendarVisibility,
  toggleCalendarNotifications,
  onClose,
  onNavigateSettings,
  onNavigateInvitations,
}: CalendarDrawerProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const safeInsets = useSafeAreaInsets();

  return (
    <>
      <Animated.View
        style={[styles.overlay, { opacity: overlayAnim }]}
        pointerEvents={open ? 'auto' : 'none'}
        onStartShouldSetResponder={() => true}
        onResponderRelease={onClose}
      />
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={[
          styles.drawer,
          {
            width: drawerWidth,
            transform: [{ translateX: drawerAnim }],
            paddingTop: insets.top + 12,
            backgroundColor: colors.background,
          },
        ]}
      >
        <View style={styles.header}>
          <AccountSwitcher
            trigger={
              <List>
                <Item
                  leading={activeAccount ? <AvatarImage account={activeAccount} size={40} /> : undefined}
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
                  trailing={<ChevronsUpDown size={20} color={colors.textTertiary} />}
                />
              </List>
            }
            footer={(close) => (
              <Item
                onPress={() => { close(); onNavigateSettings(); }}
                leading={<Settings size={20} color={colors.textSecondary} />}
                title={t('settings.title')}
              />
            )}
          />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: safeInsets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <Item
            onPress={() => { onClose(); onNavigateInvitations(); }}
            leading={<Inbox size={20} color={colors.textSecondary} />}
            title={t('invitations.title')}
            trailing={pendingInvitationsCount > 0 ? (
              <View style={[styles.badge, { backgroundColor: colors.danger }]}>
                <Typography variant="caption" color="light">{pendingInvitationsCount}</Typography>
              </View>
            ) : undefined}
          />

          <SectionHeader title={t('calendar.drawerCalendars')} />
          {calendars.length === 0 ? (
            <Stack padding={[8, 4]}>
              <Typography variant="caption" color="secondary">
                {t('calendar.drawerNoCalendars')}
              </Typography>
            </Stack>
          ) : (
            <List>
              {calendars.map((cal) => (
                <CalendarDrawerRow
                  key={cal.id}
                  calendar={cal}
                  visible={!hiddenCalendarIds.includes(cal.id)}
                  notifies={!notifDisabledCalendarIds.includes(cal.id)}
                  onToggleVisibility={() => toggleCalendarVisibility(cal.id)}
                  onToggleNotifications={() => toggleCalendarNotifications(cal.id)}
                />
              ))}
            </List>
          )}
        </ScrollView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 10 },
  drawer: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    zIndex: 11,
    shadowColor: '#000', shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 10,
  },
  header: { paddingHorizontal: 12, paddingBottom: 20 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 12 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
});
