import { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { syncEvents } from '@/database/sync';
import { useEventByUid } from '@/database/useEventByUid';
import { useCalendars } from '@/hooks/useCalendars';
import { useAccounts } from '@/hooks/useAccounts';
import { useUpdateEvent } from '@/features/event/hooks/useMutateEvent';
import { useAccountStore } from '@/stores/accountStore';
import { EventForm } from '@/features/event/components/EventForm';
import {
  ViewContainer, Stack, Typography, Button, Spinner, ScreenHeader,
} from '@/ui/components';
import type { CreateEventInput, RecurrenceEditScope } from '@/types';

export default function EditEventScreen() {
  const { uid, scope: scopeParam } = useLocalSearchParams<{ uid: string; scope?: string }>();
  const router = useRouter();
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
  const eventsLoading = !synced && event === undefined;

  const scope: RecurrenceEditScope =
    scopeParam === 'this' ? 'this'
    : scopeParam === 'thisAndFollowing' ? 'thisAndFollowing'
    : 'all';

  const updateMutation = useUpdateEvent(activeAccount!, calendars);

  function handleSubmit(input: CreateEventInput) {
    if (!activeAccount || !event) return;
    updateMutation.mutate({ event, input, scope });
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/calendar');
  }

  const isLoading = eventsLoading;

  if (isLoading || !activeAccount || calendars.length === 0) {
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

  const organizerEmail = activeAccount.username.includes('@')
    ? activeAccount.username
    : `${activeAccount.username}@${new URL(activeAccount.baseUrl).hostname}`;

  const initialValues = {
    summary: event.summary,
    calendarId: event.calendarId,
    allDay: event.allDay,
    dtstart: event.dtstart,
    dtend: event.dtend,
    description: event.description ?? '',
    location: event.location ?? '',
    attendees: event.attendees,
  };

  const scopeLabel =
    scope === 'this' ? ` (${t('event.scopeThisOccurrence')})`
    : scope === 'thisAndFollowing' ? ` (${t('event.scopeThisAndFollowing')})`
    : '';

  return (
    <ViewContainer>
      <SafeAreaView style={styles.flex}>
        <ScreenHeader
          title={`${t('event.editEvent')}${scopeLabel}`}
          left={
            <Button
              variant="link" size="small" alignment="start"
              title={t('common.cancel')}
              onPress={() => router.back()}
            />
          }
        />
        <EventForm
          calendars={calendars}
          organizerEmail={organizerEmail}
          organizerName={activeAccount.displayName}
          onSubmit={handleSubmit}
          loading={updateMutation.isPending}
          initialValues={initialValues}
          submitLabel={t('event.updateEvent')}
          disableCalendarChange={event.isRecurring}
        />
      </SafeAreaView>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
