import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccounts } from '@/hooks/useAccounts';
import { useCalendars } from '@/hooks/useCalendars';
import { useCreateEvent } from '@/features/event/hooks/useMutateEvent';
import { useAccountStore } from '@/stores/accountStore';
import { EventForm } from '@/features/event/components/EventForm';
import { ViewContainer, Stack, Typography, Button, ScreenHeader } from '@/ui/components';
import type { CreateEventInput } from '@/types';

export default function NewEventScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);

  const accounts = useAccounts();
  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;
  const { data: calendars = [] } = useCalendars(activeAccount);

  const defaultDate = useMemo(() => (date ? new Date(date) : new Date()), [date]);

  const createMutation = useCreateEvent(activeAccount!, calendars);

  function handleSubmit(input: CreateEventInput) {
    if (!activeAccount) return;
    createMutation.mutate(input);
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/calendar');
  }

  if (!activeAccount || calendars.length === 0) {
    return (
      <ViewContainer>
        <Stack flex vAlign="center" hAlign="center">
          <Typography variant="body1" color="secondary">{t('event.loadingCalendars')}</Typography>
        </Stack>
      </ViewContainer>
    );
  }

  const organizerEmail = activeAccount.username.includes('@')
    ? activeAccount.username
    : `${activeAccount.username}@${new URL(activeAccount.baseUrl).hostname}`;

  return (
    <ViewContainer>
      <SafeAreaView style={styles.flex}>
        <ScreenHeader
          title={t('event.newEvent')}
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
          defaultDate={defaultDate}
          organizerEmail={organizerEmail}
          organizerName={activeAccount.displayName}
          onSubmit={handleSubmit}
          loading={createMutation.isPending}
        />
      </SafeAreaView>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
