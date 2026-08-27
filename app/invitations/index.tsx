import { useCallback, useMemo, useState } from 'react';
import {
  Alert, RefreshControl, ScrollView, StyleSheet, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';

import {
  ViewContainer, ScreenHeader, Stack, Typography, Button, List, Item,
  Spinner, SectionHeader, Select, type SelectOption,
} from '@/ui/components';
import { useAccounts, useActiveAccount } from '@/hooks/useAccounts';
import { useCalendars } from '@/hooks/useCalendars';
import { useInvitations } from '@/features/invitations/hooks/useInvitations';
import { respondToInvitation } from '@/services/nextcloud/invitations';
import type { CalendarInvitation, CalendarMeta, InvitationResponse } from '@/types';
import { goBackOrHome } from '@/utils/navigationGuard';
import { Inbox } from 'lucide-react-native';

dayjs.extend(localizedFormat);

export default function InvitationsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useTheme();
  const accounts = useAccounts();
  const activeAccount = useActiveAccount(accounts[0]?.id ?? null);
  const { data: calendars = [] } = useCalendars(activeAccount);
  const { data: invitations, isFetching, error, refresh } = useInvitations(activeAccount);

  const [responding, setResponding] = useState<Set<string>>(new Set());

  const writableCalendars = useMemo(
    () => calendars.filter((c) => !c.isReadOnly && c.supportsEvents !== false),
    [calendars],
  );

  const calendarOptions: SelectOption<string>[] = useMemo(
    () => writableCalendars.map((c) => ({ value: c.id, label: c.displayName, leading: () => (
      <View style={[styles.colorDot, { backgroundColor: c.color }]} />
    ) })),
    [writableCalendars],
  );

  const [selectedCalendarId, setSelectedCalendarId] = useState<string | undefined>(undefined);

  const defaultCalendar = selectedCalendarId
    ? writableCalendars.find((c) => c.id === selectedCalendarId)
    : writableCalendars[0];

  const handleRespond = useCallback(async (
    invitation: CalendarInvitation,
    response: InvitationResponse,
  ) => {
    if (!activeAccount) return;
    if (response !== 'declined' && !defaultCalendar) {
      Alert.alert(t('invitations.error'), t('event.noWritableCalendars'));
      return;
    }

    setResponding((prev) => new Set([...prev, invitation.uid]));
    try {
      await respondToInvitation(
        activeAccount,
        invitation,
        response,
        response === 'declined' ? calendars[0] : defaultCalendar!,
      );
      refresh();
    } catch (e) {
      Alert.alert(t('invitations.error'), t('invitations.responseFailed'));
    } finally {
      setResponding((prev) => {
        const next = new Set(prev);
        next.delete(invitation.uid);
        return next;
      });
    }
  }, [activeAccount, defaultCalendar, calendars, refresh, t]);

  const formatDate = (inv: CalendarInvitation) => inv.allDay
    ? (dayjs(inv.dtstart).isSame(inv.dtend, 'day')
      ? t('event.allDayTime')
      : `${dayjs(inv.dtstart).format('ll')} – ${dayjs(inv.dtend).format('ll')}`)
    : `${dayjs(inv.dtstart).format('lll')} – ${dayjs(inv.dtend).format('LT')}`;

  if (!activeAccount) {
    return (
      <ViewContainer>
        <SafeAreaView edges={['top']} style={styles.flex}>
          <ScreenHeader onBack={() => goBackOrHome(router)} title={t('invitations.title')} />
          <Stack flex vAlign="center" hAlign="center">
            <Typography color="secondary">{t('settings.account.notFound')}</Typography>
          </Stack>
        </SafeAreaView>
      </ViewContainer>
    );
  }

  return (
    <ViewContainer>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScreenHeader onBack={() => goBackOrHome(router)} title={t('invitations.title')} />

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={isFetching} onRefresh={refresh} tintColor={theme.colors.primary} />
          }
        >
          {error && (
            <Stack padding={[16, 0]}>
              <Typography color="danger">{t('invitations.error')}</Typography>
            </Stack>
          )}

          {calendarOptions.length > 0 && (
            <Stack gap={8} padding={[0, 16]}>
              <SectionHeader title={t('invitations.selectCalendar')} />
              <Select
                value={defaultCalendar?.id ?? ''}
                options={calendarOptions}
                onChange={(id) => setSelectedCalendarId(id)}
              />
            </Stack>
          )}

          {invitations.length === 0 && !isFetching ? (
            <Stack flex vAlign="center" hAlign="center" gap={12} style={{ marginTop: 48 }}>
              <Inbox size={48} color={theme.colors.textTertiary} />
              <Typography color="secondary">{t('invitations.noInvitations')}</Typography>
            </Stack>
          ) : (
            <List>
              {invitations.map((inv) => (
                <View key={inv.uid} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                  <Item
                    title={
                      <Typography variant="body1" numberOfLines={1} ellipsizeMode="tail">
                        {inv.summary || t('calendar.noTitle')}
                      </Typography>
                    }
                    description={
                      <Typography variant="caption" color="secondary" numberOfLines={2}>
                        {inv.organizerName
                          ? t('invitations.from', { name: inv.organizerName })
                          : inv.organizerEmail}
                      </Typography>
                    }
                  />
                  <Stack padding={[16, 12]}>
                    <Typography variant="caption" color="secondary">{formatDate(inv)}</Typography>
                    {inv.location && (
                      <Typography variant="caption" color="secondary" numberOfLines={1} ellipsizeMode="tail">
                        {inv.location}
                      </Typography>
                    )}
                  </Stack>
                  <View style={[styles.actions, { borderTopColor: theme.colors.border }]}>
                    <Button
                      variant="ghost"
                      color="danger"
                      size="small"
                      inline
                      loading={responding.has(inv.uid)}
                      disabled={responding.has(inv.uid)}
                      title={t('invitations.decline')}
                      onPress={() => handleRespond(inv, 'declined')}
                    />
                    <Button
                      variant="ghost"
                      size="small"
                      inline
                      loading={responding.has(inv.uid)}
                      disabled={responding.has(inv.uid)}
                      title={t('invitations.tentative')}
                      onPress={() => handleRespond(inv, 'tentative')}
                    />
                    <Button
                      variant="primary"
                      size="small"
                      inline
                      loading={responding.has(inv.uid)}
                      disabled={responding.has(inv.uid)}
                      title={t('invitations.accept')}
                      onPress={() => handleRespond(inv, 'accepted')}
                    />
                  </View>
                </View>
              ))}
            </List>
          )}

          {isFetching && invitations.length === 0 && (
            <Stack flex vAlign="center" hAlign="center" padding={[32, 0]}>
              <Spinner size="large" />
            </Stack>
          )}
        </ScrollView>
      </SafeAreaView>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16 },
  card: {
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 12,
    overflow: 'hidden',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
});
