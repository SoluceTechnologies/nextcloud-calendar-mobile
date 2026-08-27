import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';

import { useAccounts } from '@/hooks/useAccounts';
import { useCalendars } from '@/hooks/useCalendars';
import { useAccountStore } from '@/stores/accountStore';
import { useCreateEvent } from '@/features/event/hooks/useMutateEvent';
import { useImportIcs } from '@/features/event/hooks/useImportIcs';
import { resolveOrganizer } from '@/features/event/utils/organizer';
import {
  eventToFormValues,
  extractOrganizerName,
} from '@/features/event/utils/icsImport';
import { goBackOrHome } from '@/utils/navigationGuard';
import { EventForm } from '@/features/event/components/EventForm';
import {
  ViewContainer,
  Stack,
  Typography,
  Button,
  Spinner,
  ScreenHeader,
  List,
  Item,
} from '@/ui/components';
import type { CalendarEvent, CreateEventInput } from '@/types';

dayjs.extend(localizedFormat);

interface Props {
  uri: string;
}

function formatEventDate(event: CalendarEvent): string {
  const start = dayjs(event.dtstart).format('lll');
  const end = dayjs(event.dtend).format('lll');
  return event.allDay ? dayjs(event.dtstart).format('LL') : `${start} – ${end}`;
}

export function IcsImportScreen({ uri }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { loading, error, events, originalIcs, reload } = useImportIcs(uri);

  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const accounts = useAccounts();
  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;
  const { data: calendars = [] } = useCalendars(activeAccount);

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [savedUids, setSavedUids] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSavedUids(new Set());
    setSelectedEvent(null);
  }, [uri]);

  const visibleEvents = useMemo(
    () => events.filter((e) => !savedUids.has(e.uid)),
    [events, savedUids],
  );

  const createMutation = useCreateEvent(activeAccount!, calendars);

  const handleSubmit = useCallback(
    async (input: CreateEventInput) => {
      try {
        await createMutation.mutateAsync(input);
        const nextSaved = new Set(savedUids);
        nextSaved.add(input.uid!);
        setSavedUids(nextSaved);
        const remaining = events.filter((e) => !nextSaved.has(e.uid));
        if (remaining.length === 0) {
          goBackOrHome(router);
        } else {
          setSelectedEvent(null);
        }
      } catch {
        // useCreateEvent already shows an alert
      }
    },
    [createMutation, events, router, savedUids],
  );

  if (!activeAccount) {
    return (
      <ViewContainer>
        <SafeAreaView style={styles.flex}>
          <ScreenHeader title={t('import.title')} onBack={() => router.back()} />
          <Stack flex vAlign="center" hAlign="center" gap={16}>
            <Typography variant="body1" color="secondary">{t('import.errorNoAccount')}</Typography>
            <Button variant="primary" title={t('import.back')} onPress={() => router.back()} />
          </Stack>
        </SafeAreaView>
      </ViewContainer>
    );
  }

  if (loading) {
    return (
      <ViewContainer>
        <SafeAreaView style={styles.flex}>
          <ScreenHeader title={t('import.title')} onBack={() => router.back()} />
          <Stack flex vAlign="center" hAlign="center">
            <Spinner size="large" />
          </Stack>
        </SafeAreaView>
      </ViewContainer>
    );
  }

  if (error) {
    return (
      <ViewContainer>
        <SafeAreaView style={styles.flex}>
          <ScreenHeader title={t('import.title')} onBack={() => router.back()} />
          <Stack padding={20} gap={16} vAlign="center" hAlign="center">
            <Typography variant="body1" color="danger">{error}</Typography>
            <Button variant="primary" title={t('import.retry')} onPress={reload} />
          </Stack>
        </SafeAreaView>
      </ViewContainer>
    );
  }

  if (visibleEvents.length === 0) {
    return (
      <ViewContainer>
        <SafeAreaView style={styles.flex}>
          <ScreenHeader title={t('import.title')} onBack={() => router.back()} />
          <Stack flex vAlign="center" hAlign="center" gap={16}>
            <Typography variant="body1" color="secondary">{t('import.noEventsFound')}</Typography>
            <Button variant="primary" title={t('import.back')} onPress={() => router.back()} />
          </Stack>
        </SafeAreaView>
      </ViewContainer>
    );
  }

  if (selectedEvent) {
    const { organizerEmail, organizerName } = resolveOrganizer(activeAccount);
    const importedEmail = selectedEvent.organizerEmail ?? organizerEmail;
    const importedName =
      extractOrganizerName(originalIcs, selectedEvent.uid) ?? organizerName;

    return (
      <ViewContainer>
        <SafeAreaView style={styles.flex}>
          <ScreenHeader
            title={t('import.importEvent')}
            onBack={() => setSelectedEvent(null)}
          />
          <EventForm
            calendars={calendars}
            organizerEmail={importedEmail}
            organizerName={importedName}
            onSubmit={handleSubmit}
            loading={createMutation.isPending}
            initialValues={eventToFormValues(selectedEvent, originalIcs)}
            submitLabel={t('import.importEvent')}
          />
        </SafeAreaView>
      </ViewContainer>
    );
  }

  return (
    <ViewContainer>
      <SafeAreaView style={styles.flex}>
        <ScreenHeader title={t('import.title')} onBack={() => router.back()} />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Stack padding={20} gap={16}>
            <Typography variant="body1" color="secondary">
              {t('import.selectEvent')}
            </Typography>
            <List>
              {visibleEvents.map((event) => (
                <Item
                  key={event.uid}
                  title={event.summary || t('import.untitledEvent')}
                  description={formatEventDate(event)}
                  onPress={() => setSelectedEvent(event)}
                />
              ))}
            </List>
          </Stack>
        </ScrollView>
      </SafeAreaView>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
});
