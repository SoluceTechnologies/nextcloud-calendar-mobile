import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react-native';
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
  splitIcsByUid,
} from '@/features/event/utils/icsImport';
import { eventExists } from '@/database/eventWrites';
import { syncCalendarDelta } from '@/database/sync';
import { putEvent } from '@/services/nextcloud/caldav';
import { useSettingsStore } from '@/stores/settingsStore';
import { defaultWritableCalendarId, isWritableCalendar } from '@/utils/calendars';
import { goBackOrHome } from '@/utils/navigationGuard';
import { EventForm, type EventFormHandle } from '@/features/event/components/EventForm';
import {
  ViewContainer,
  Stack,
  Typography,
  Button,
  Spinner,
  ScreenHeader,
  IconButton,
  List,
  Item,
  Chip,
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
  const { colors } = useTheme();
  const formRef = useRef<EventFormHandle>(null);
  const { loading, error, events, originalIcs, reload } = useImportIcs(uri);

  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const accounts = useAccounts();
  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;
  const { data: calendars = [] } = useCalendars(activeAccount);

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [savedUids, setSavedUids] = useState<Set<string>>(new Set());
  const [importingAll, setImportingAll] = useState(false);
  const writableCalendars = useMemo(() => calendars.filter(isWritableCalendar), [calendars]);
  const storedDefault = useSettingsStore((s) =>
    activeAccount ? s.defaultCalendarByAccount[activeAccount.id] : undefined,
  );
  const [targetCalendarId, setTargetCalendarId] = useState<string | null>(null);
  const targetCalendar =
    writableCalendars.find((c) => c.id === targetCalendarId) ??
    writableCalendars.find((c) => c.id === defaultWritableCalendarId(writableCalendars, storedDefault));

  useEffect(() => {
    setSavedUids(new Set());
    setSelectedEvent(null);
  }, [uri]);

  const visibleEvents = useMemo(
    () => events.filter((e) => !savedUids.has(e.uid)),
    [events, savedUids],
  );

  const createMutation = useCreateEvent(activeAccount!, calendars);

  const runImport = useCallback(
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
      }
    },
    [createMutation, events, router, savedUids],
  );

  const handleSubmit = useCallback(
    async (input: CreateEventInput) => {
      const uid = input.uid;
      if (
        uid &&
        activeAccount &&
        (await eventExists(activeAccount.id, input.calendarId, uid))
      ) {
        Alert.alert(t('import.duplicateTitle'), t('import.duplicateMessage'), [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('import.overwrite'),
            style: 'destructive',
            onPress: () => void runImport(input),
          },
        ]);
        return;
      }
      await runImport(input);
    },
    [activeAccount, runImport, t],
  );

  const putAll = useCallback(
    async (skipExisting: boolean) => {
      if (!activeAccount || !targetCalendar) return;
      setImportingAll(true);
      const byUid = splitIcsByUid(originalIcs);
      const pending = visibleEvents.filter((event) => byUid.has(event.uid));
      let failed = 0;
      for (const event of pending) {
        if (skipExisting && (await eventExists(activeAccount.id, targetCalendar.id, event.uid))) continue;
        try {
          await putEvent(activeAccount, targetCalendar, event.uid, byUid.get(event.uid)!);
        } catch {
          failed += 1;
        }
      }
      await syncCalendarDelta(activeAccount, targetCalendar).catch(() => undefined);
      setImportingAll(false);
      if (failed > 0) {
        Alert.alert(t('import.importAllFailedTitle'), t('import.importAllFailed', { count: failed, total: pending.length }));
        return;
      }
      goBackOrHome(router);
    },
    [activeAccount, originalIcs, router, t, targetCalendar, visibleEvents],
  );

  const handleImportAll = useCallback(async () => {
    if (!activeAccount || !targetCalendar) return;
    const existing = await Promise.all(
      visibleEvents.map((event) => eventExists(activeAccount.id, targetCalendar.id, event.uid)),
    );
    if (!existing.some(Boolean)) {
      await putAll(false);
      return;
    }
    Alert.alert(t('import.duplicateTitle'), t('import.duplicateAllMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('import.skipExisting'), onPress: () => void putAll(true) },
      { text: t('import.overwrite'), style: 'destructive', onPress: () => void putAll(false) },
    ]);
  }, [activeAccount, putAll, t, targetCalendar, visibleEvents]);

  const singleEvent = events.length === 1 ? events[0] : null;
  useEffect(() => {
    if (singleEvent) setSelectedEvent(singleEvent);
  }, [singleEvent]);

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
            <Typography variant="body1" color="danger">{t(`import.${error}`)}</Typography>
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
            onBack={() => (singleEvent ? router.back() : setSelectedEvent(null))}
            right={
              <IconButton
                glass
                round
                size={40}
                onPress={createMutation.isPending ? undefined : () => formRef.current?.submit()}
                accessibilityRole="button"
                accessibilityLabel={createMutation.isPending ? t('event.saving') : t('import.importEvent')}
              >
                {createMutation.isPending
                  ? <Spinner />
                  : <Check size={22} color={colors.primary} />}
              </IconButton>
            }
          />
          <EventForm
            ref={formRef}
            account={activeAccount}
            calendars={calendars}
            organizerEmail={importedEmail}
            organizerName={importedName}
            onSubmit={handleSubmit}
            initialValues={eventToFormValues(selectedEvent, originalIcs)}
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
            <Typography variant="body2" color="secondary">{t('event.calendar')}</Typography>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {writableCalendars.map((calendar) => (
                <Chip
                  key={calendar.id}
                  rounded
                  active={targetCalendar?.id === calendar.id}
                  activeColor={calendar.color}
                  onPress={() => setTargetCalendarId(calendar.id)}
                >
                  {calendar.displayName}
                </Chip>
              ))}
            </ScrollView>
            <Button
              variant="primary"
              testID="import-all"
              title={importingAll ? t('import.importing') : t('import.importAll', { count: visibleEvents.length })}
              disabled={importingAll || !targetCalendar}
              onPress={() => void handleImportAll()}
            />
          </Stack>
        </ScrollView>
      </SafeAreaView>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  chipRow: { gap: 8 },
});
