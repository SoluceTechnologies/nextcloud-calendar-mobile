import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, Linking, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { haptic } from '@/utils/haptics';
import {
  Pencil, Clock, CalendarDays, MapPin, Video, Repeat, Trash2, Copy, Check, Bell,
  Map as MapIcon,
} from 'lucide-react-native';
import { useLocalSearchParams, useNavigation, useRouter, useTheme } from 'expo-router';
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { useTranslation } from 'react-i18next';
import { syncEvents } from '@/database/sync';
import { useEventByUid } from '@/database/useEventByUid';
import { useCalendars } from '@/hooks/useCalendars';
import { useAccounts } from '@/hooks/useAccounts';
import { useDeleteEvent } from '@/features/event/hooks/useMutateEvent';
import { useEventLocation } from '@/features/map/hooks/useEventLocation';
import { EventMapPreview, EventMapSheet } from '@/features/map/components';
import { openMapsUrl } from '@/features/map/utils/mapLinks';
import { useAccountStore } from '@/stores/accountStore';
import {
  ViewContainer, Stack, Typography, Button, Chip, Icon, List, Item,
  SectionHeader, Avatar, Spinner, ScreenHeader,
  IconButton,
} from '@/ui/components';
import type { RecurrenceEditScope } from '@/types';
import { askRecurrenceScope, type RecurrenceScopeStrings } from '@/features/event/recurrenceScope';
import { decideMoveEventScope } from '@/features/calendar/utils/moveEventScope';
import {
  TIMED_ALERTS, ALL_DAY_ALERTS, timedAlertLabelKey, allDayAlertLabelKey,
  type TimedAlert, type AllDayAlert,
} from '@/features/notifications/alerts';
import { goBackOrHome } from '@/utils/navigationGuard';

dayjs.extend(localizedFormat);

async function openTalkRoom(talkUrl: string) {
  if (Platform.OS === 'android') {
    const withoutScheme = talkUrl.replace(/^https?:\/\//, '');
    const fallback = encodeURIComponent(talkUrl);
    try {
      await Linking.openURL(`intent://${withoutScheme}#Intent;scheme=https;package=com.nextcloud.talk2;S.browser_fallback_url=${fallback};end`);
    } catch {
      await Linking.openURL(talkUrl);
    }
    return;
  }
  await Linking.openURL(talkUrl);
}

export default function EventDetailScreen() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { t } = useTranslation();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const accounts = useAccounts();
  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;
  const { data: calendars = [] } = useCalendars(activeAccount);

  const event = useEventByUid(activeAccountId, uid);

  const navigation = useNavigation();
  useEffect(() => {
    const state = navigation.getState();
    if (!state || state.type !== 'stack') return;
    const routes = state.routes;
    const top = routes.length - 1;
    if (top < 1) return;
    const topName = routes[top]?.name;
    const hasDuplicateBelow = routes.slice(0, top).some((r) => r.name === topName);
    if (!hasDuplicateBelow) return;
    navigation.reset({ index: 1, routes: [routes[0], routes[top]] } as Parameters<typeof navigation.reset>[0]);
  }, [navigation]);

  const start = useMemo(() => dayjs().subtract(3, 'months').toDate(), []);
  const end = useMemo(() => dayjs().add(3, 'months').toDate(), []);
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    if (!activeAccount || calendars.length === 0) return;
    let active = true;
    syncEvents(activeAccount, calendars, start, end)
      .catch(() => undefined)
      .finally(() => { if (active) setSynced(true); });
    return () => { active = false; };
  }, [activeAccount, calendars, start, end]);

  const calendar = calendars.find((c) => c.id === event?.calendarId);
  const deleteMutation = useDeleteEvent(activeAccount!);

  const canEdit = !calendar?.isReadOnly && !calendar?.isSubscribed && !event?.isTask;
  const eventsLoading = !synced && event === undefined;

  const [copied, setCopied] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const copyResetRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(copyResetRef.current), []);

  const { coordinates, isVirtual } = useEventLocation(event?.location, event?.talkUrl);

  const handleCopyLocation = useCallback(async () => {
    if (!event?.location) return;
    await Clipboard.setStringAsync(event.location);
    haptic();
    setCopied(true);
    clearTimeout(copyResetRef.current);
    copyResetRef.current = setTimeout(() => setCopied(false), 1500);
  }, [event?.location]);

  const handleOpenMaps = useCallback(async () => {
    if (!event?.location) return;
    const url = openMapsUrl(event.location, coordinates?.lat, coordinates?.lon);
    await Linking.openURL(url).catch(() => {});
  }, [event?.location, coordinates]);

  const recurrenceScopeStrings: RecurrenceScopeStrings = {
    message: t('event.recurrenceScopeMessage'),
    thisOnly: t('event.scopeThisOnly'),
    thisAndFollowing: t('event.scopeThisAndFollowingBtn'),
    all: t('event.scopeAllEvents'),
    cancel: t('common.cancel'),
  };

  function handleEdit() {
    if (!event) return;
    const decision = decideMoveEventScope(event);
    if (decision.kind === 'commit') {
      if (decision.scope === 'this') {
        router.push({ pathname: `/event/edit/${uid}`, params: { scope: 'this' } });
      } else {
        router.push(`/event/edit/${uid}`);
      }
      return;
    }
    askRecurrenceScope(t('event.editEvent'), recurrenceScopeStrings, (scope) => {
      router.push({ pathname: `/event/edit/${uid}`, params: { scope } });
    });
  }

  function handleDelete() {
    if (!event) return;

    const doDelete = (scope: RecurrenceEditScope) => {
      Alert.alert(
        t('event.deleteEvent'),
        scope === 'all' && event.isRecurring
          ? t('event.deleteAllMsg')
          : scope === 'thisAndFollowing'
          ? t('event.deleteThisAndFollowingMsg')
          : t('event.deleteConfirmMsg'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('event.delete'), style: 'destructive',
            onPress: async () => {
              await deleteMutation.mutateAsync({ event, scope });
              goBackOrHome(router);
            },
          },
        ]
      );
    };

    if (event.isRecurring) {
      askRecurrenceScope(t('event.deleteEvent'), recurrenceScopeStrings, doDelete);
    } else {
      doDelete('all');
    }
  }

  const isLoading = eventsLoading;

  if (isLoading) {
    return (
      <ViewContainer>
        <Stack flex vAlign="center" hAlign="center">
          <Spinner size="large" />
        </Stack>
      </ViewContainer>
    );
  }

  if (!event) {
    if (deleteMutation.isPending) {
      return (
        <ViewContainer>
          <Stack flex vAlign="center" hAlign="center">
            <Spinner size="large" />
          </Stack>
        </ViewContainer>
      );
    }
    return (
      <ViewContainer>
        <Stack flex vAlign="center" hAlign="center" gap={16}>
          <Typography variant="body1" color="secondary">{t('event.eventNotFound')}</Typography>
          <Button variant="link" title={t('event.back')} onPress={() => goBackOrHome(router)} />
        </Stack>
      </ViewContainer>
    );
  }

  const timeStr = event.allDay
    ? (dayjs(event.dtstart).isSame(event.dtend, 'day')
        ? t('event.allDayTime')
        : `${dayjs(event.dtstart).format('ll')} – ${dayjs(event.dtend).format('ll')}`)
    : `${dayjs(event.dtstart).format('lll')} – ${dayjs(event.dtend).format('LT')}`;

  const reminderLabel = (() => {
    if (event.alarmMinutes === undefined) return null;
    const m = event.alarmMinutes;
    if (event.allDay) {
      const days = m / 1440;
      return (ALL_DAY_ALERTS as (number | null)[]).includes(days)
        ? t(allDayAlertLabelKey(days as AllDayAlert))
        : t('event.alert');
    }
    return (TIMED_ALERTS as (number | null)[]).includes(m)
      ? t(timedAlertLabelKey(m as TimedAlert))
      : t('event.reminder');
  })();

  return (
    <ViewContainer>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScreenHeader
          onBack={() => goBackOrHome(router)}
          right={canEdit ? (
            <IconButton glass round size={40} onPress={handleEdit} accessibilityLabel={t('event.edit')}>
              <Pencil size={20} color={theme.colors.primary} />
            </IconButton>
          ) : undefined}
        />

        <View style={[styles.colorBar, { backgroundColor: event.color }]} />

        <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingBottom: 24 }]}>
          <Stack gap={20}>
            <Stack gap={10}>
              <Typography variant="h3">{event.summary}</Typography>
              {event.isRecurring && (
                <Stack direction="horizontal" inline>
                  <Chip icon={<Repeat size={14} color={theme.colors.primary} />}>
                    {t('event.recurring')}
                  </Chip>
                </Stack>
              )}
            </Stack>

            <List>
              <Item
                leading={<Icon size={20}><Clock color={theme.colors.textSecondary} /></Icon>}
                title={timeStr}
              />
              {reminderLabel && (
                <Item
                  leading={<Icon size={20}><Bell color={theme.colors.textSecondary} /></Icon>}
                  title={reminderLabel}
                />
              )}
              {calendar && (
                <Item
                  leading={<Icon size={20}><CalendarDays color={calendar.color} /></Icon>}
                  title={calendar.displayName}
                />
              )}
              {event.location && (
                <Item
                  leading={<Icon size={20}><MapPin color={theme.colors.textSecondary} /></Icon>}
                  title={event.location}
                  trailing={
                    <Stack direction="horizontal" gap={4} vAlign="center">
                      {!isVirtual && (
                        <IconButton
                          variant="plain"
                          size={36}
                          onPress={handleOpenMaps}
                          accessibilityLabel={t('event.openInMaps')}
                        >
                          <MapIcon size={18} color={theme.colors.textSecondary} />
                        </IconButton>
                      )}
                      <IconButton
                        variant="plain"
                        size={36}
                        onPress={handleCopyLocation}
                      >
                        {copied
                          ? <Check size={18} color={theme.colors.primary} />
                          : <Copy size={18} color={theme.colors.textSecondary} />}
                      </IconButton>
                    </Stack>
                  }
                />
              )}
            </List>

            {coordinates && !isVirtual && (
              <EventMapPreview
                location={event.location!}
                coordinates={coordinates}
                onPress={() => setMapVisible(true)}
              />
            )}

            {coordinates && (
              <EventMapSheet
                visible={mapVisible}
                onClose={() => setMapVisible(false)}
                location={event.location!}
                coordinates={coordinates}
              />
            )}

            {event.talkUrl && (
              <Button
                variant="primary"
                title={t('event.joinTalkRoom')}
                icon={<Video size={18} color="#fff" />}
                onPress={() => openTalkRoom(event.talkUrl!)}
              />
            )}

            {event.description && (
              <Stack gap={8}>
                <SectionHeader title={t('event.description')} />
                <Stack card padding={16}>
                  <Typography variant="body2" color="secondary">{event.description}</Typography>
                </Stack>
              </Stack>
            )}

            {event.attendees.length > 0 && (
              <Stack gap={8}>
                <SectionHeader title={t('event.attendees')} />
                <List>
                  {event.attendees
                    .filter((a, i, arr) => arr.findIndex((b) => (b.email ?? '').toLowerCase() === (a.email ?? '').toLowerCase()) === i)
                    .map((att, i) => (
                      <Item
                        key={att.email || `attendee-${i}`}
                        leading={<Avatar name={att.displayName ?? att.email} size={36} />}
                        title={att.displayName ?? att.email}
                        description={att.displayName ? att.email : undefined}
                      />
                    ))}
                </List>
              </Stack>
            )}

          </Stack>
        </ScrollView>

        {canEdit && (
          <Stack
            padding={[20, 12]}
            style={[styles.footer, { paddingBottom: insets.bottom + 12, borderTopColor: theme.colors.border }]}
          >
            <Button
              variant="ghost" color="danger"
              title={t('event.deleteEvent')}
              icon={<Trash2 size={18} color={theme.colors.danger} />}
              loading={deleteMutation.isPending}
              disabled={deleteMutation.isPending}
              onPress={handleDelete}
            />
          </Stack>
        )}
      </SafeAreaView>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  colorBar: { height: 6 },
  content: { padding: 20 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
});
