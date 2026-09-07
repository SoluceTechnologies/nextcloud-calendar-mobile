import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccounts } from '@/hooks/useAccounts';
import { useCalendars } from '@/hooks/useCalendars';
import { useCreateEvent } from '@/features/event/hooks/useMutateEvent';
import { resolveOrganizer } from '@/features/event/utils/organizer';
import { useAccountStore } from '@/stores/accountStore';
import { EventForm } from '@/features/event/components/EventForm';
import { ViewContainer, Stack, Typography, ScreenHeader } from '@/ui/components';
import { goBackOrHome } from '@/utils/navigationGuard';
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

  async function handleSubmit(input: CreateEventInput) {
    if (!activeAccount) return;
    await createMutation.mutateAsync(input);
    goBackOrHome(router);
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

  const { organizerEmail, organizerName } = resolveOrganizer(activeAccount);

  return (
    <ViewContainer>
      <SafeAreaView style={styles.flex}>
        <ScreenHeader title={t('event.newEvent')} onBack={() => router.back()} />
        <EventForm
          calendars={calendars}
          defaultDate={defaultDate}
          organizerEmail={organizerEmail}
          organizerName={organizerName}
          onSubmit={handleSubmit}
          loading={createMutation.isPending}
          account={activeAccount}
        />
      </SafeAreaView>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
