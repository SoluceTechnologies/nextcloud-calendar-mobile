import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, Linking, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Pencil, Clock, CalendarDays, MapPin, Video, Repeat, Trash2, Copy, Check } from 'lucide-react-native';
import { useLocalSearchParams, useRouter, useTheme } from 'expo-router';
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { useTranslation } from 'react-i18next';
import { syncEvents } from '@/database/sync';
import { useEventByUid } from '@/database/useEventByUid';
import { useCalendars } from '@/hooks/useCalendars';
import { useAccounts } from '@/hooks/useAccounts';
import { useDeleteEvent } from '@/features/event/hooks/useMutateEvent';
import { useAccountStore } from '@/stores/accountStore';
import {
  ViewContainer, Stack, Typography, Button, Chip, Icon, List, Item,
  SectionHeader, Avatar, Spinner, ScreenHeader,
  IconButton,
} from '@/ui/components';
import type { CalendarEvent, RecurrenceEditScope } from '@/types';

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

interface RecurrenceScopeStrings {
  message: string;
  thisOnly: string;
  thisAndFollowing: string;
  all: string;
  cancel: string;
}

function askRecurrenceScope(
  title: string,
  strings: RecurrenceScopeStrings,
  onSelect: (scope: RecurrenceEditScope) => void,
) {
  Alert.alert(title, strings.message, [
    {
      text: strings.thisOnly,
      onPress: () => onSelect('this'),
    },
    {
      text: strings.thisAndFollowing,
      onPress: () => onSelect('thisAndFollowing'),
    },
    {
      text: strings.all,
      onPress: () => onSelect('all'),
    },
    { text: strings.cancel, style: 'cancel' },
  ],
    {
      cancelable: true,
    },
 );
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
  const canEdit = !calendar?.isReadOnly && !calendar?.isSubscribed;
  const eventsLoading = !synced && event === undefined;

  const [copied, setCopied] = useState(false);
  const copyResetRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(copyResetRef.current), []);

  const handleCopyLocation = useCallback(async () => {
    if (!event?.location) return;
    await Clipboard.setStringAsync(event.location);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setCopied(true);
    clearTimeout(copyResetRef.current);
    copyResetRef.current = setTimeout(() => setCopied(false), 1500);
  }, [event?.location]);

  const recurrenceScopeStrings: RecurrenceScopeStrings = {
    message: t('event.recurrenceScopeMessage'),
    thisOnly: t('event.scopeThisOnly'),
    thisAndFollowing: t('event.scopeThisAndFollowingBtn'),
    all: t('event.scopeAllEvents'),
    cancel: t('common.cancel'),
  };

  function handleEdit() {
    if (!event) return;
    if (event.isRecurring) {
      askRecurrenceScope(t('event.editEvent'), recurrenceScopeStrings, (scope) => {
        router.push({ pathname: `/event/edit/${uid}`, params: { scope } });
      });
    } else {
      router.push(`/event/edit/${uid}`);
    }
  }

  function handleDelete() {
    if (!event) return;

    const doDelete = (scope: RecurrenceEditScope) => {
      Alert.alert(
        t('event.deleteEvent'),
        scope === 'all'
          ? t('event.deleteAllMsg')
          : scope === 'thisAndFollowing'
          ? t('event.deleteThisAndFollowingMsg')
          : t('event.deleteConfirmMsg'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('event.delete'), style: 'destructive',
            onPress: () => {
              deleteMutation.mutate({ event, scope });
              if (router.canGoBack()) router.back();
              else router.replace('/(tabs)/calendar');
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
    return (
      <ViewContainer>
        <Stack flex vAlign="center" hAlign="center" gap={16}>
          <Typography variant="body1" color="secondary">{t('event.eventNotFound')}</Typography>
          <Button variant="link" title={t('event.back')} onPress={() => router.back()} />
        </Stack>
      </ViewContainer>
    );
  }

  const timeStr = event.allDay
    ? (dayjs(event.dtstart).isSame(event.dtend, 'day')
        ? t('event.allDayTime')
        : `${dayjs(event.dtstart).format('ll')} – ${dayjs(event.dtend).format('ll')}`)
    : `${dayjs(event.dtstart).format('lll')} – ${dayjs(event.dtend).format('LT')}`;

  return (
    <ViewContainer>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScreenHeader
          onBack={() => router.back()}
          right={canEdit ? (
            <IconButton variant="plain" size={40} onPress={handleEdit}>
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
                    <IconButton
                      variant="plain"
                      size={36}
                      onPress={handleCopyLocation}
                    >
                      {copied
                        ? <Check size={18} color={theme.colors.primary} />
                        : <Copy size={18} color={theme.colors.textSecondary} />}
                    </IconButton>
                  }
                />
              )}
            </List>

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
                  {event.attendees.map((att) => (
                    <Item
                      key={att.email}
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
