import { useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react-native';
import { useAccounts, useEnabledAccounts } from '@/hooks/useAccounts';
import { useMergedCalendars } from '@/hooks/useCalendars';
import { useCreateEvent } from '@/features/event/hooks/useMutateEvent';
import { resolveOrganizer } from '@/features/event/utils/organizer';
import { useAccountStore } from '@/stores/accountStore';
import { EventForm, type EventFormHandle } from '@/features/event/components/EventForm';
import { ViewContainer, Stack, Typography, IconButton, Spinner, ScreenHeader } from '@/ui/components';
import { goBackOrHome } from '@/utils/navigationGuard';
import type { CreateEventInput } from '@/types';

export default function NewEventScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);

  const accounts = useAccounts();
  const enabled = useEnabledAccounts();
  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;
  const defaultAccount = activeAccount ?? enabled[0] ?? null;
  const { data: calendars = [] } = useMergedCalendars(enabled);

  const defaultDate = useMemo(() => (date ? new Date(date) : new Date()), [date]);

  const createMutation = useCreateEvent(accounts, calendars);
  const formRef = useRef<EventFormHandle>(null);

  async function handleSubmit(input: CreateEventInput) {
    const cal = calendars.find((c) => c.id === input.calendarId);
    const targetAccount = cal ? accounts.find((a) => a.id === cal.accountId) : defaultAccount;
    if (!targetAccount) return;
    const organizer = resolveOrganizer(targetAccount);
    await createMutation.mutateAsync({
      ...input,
      organizerEmail: organizer.organizerEmail,
      organizerName: organizer.organizerName,
    });
    goBackOrHome(router);
  }

  if (!defaultAccount || calendars.length === 0) {
    return (
      <ViewContainer>
        <Stack flex vAlign="center" hAlign="center">
          <Typography variant="body1" color="secondary">{t('event.loadingCalendars')}</Typography>
        </Stack>
      </ViewContainer>
    );
  }

  const { organizerEmail, organizerName } = resolveOrganizer(defaultAccount);

  return (
    <ViewContainer>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.flex}>
        <ScreenHeader
          title={t('event.newEvent')}
          onBack={() => router.back()}
          right={
            <IconButton
              testID="event-form-save"
              glass
              round
              size={40}
              onPress={createMutation.isPending ? undefined : () => formRef.current?.submit()}
              accessibilityRole="button"
              accessibilityLabel={createMutation.isPending ? t('event.saving') : t('event.saveEvent')}
            >
              {createMutation.isPending
                ? <Spinner />
                : <Check size={22} color={colors.primary} />}
            </IconButton>
          }
        />
        <EventForm
          ref={formRef}
          calendars={calendars}
          defaultDate={defaultDate}
          organizerEmail={organizerEmail}
          organizerName={organizerName}
          onSubmit={handleSubmit}
          account={defaultAccount}
        />
      </SafeAreaView>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
