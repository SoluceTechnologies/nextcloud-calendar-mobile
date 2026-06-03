import { useMemo } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { loadAccounts } from '@/api/auth';
import { fetchEvents } from '@/api/caldav';
import { useCalendars } from '@/hooks/useCalendars';
import { useUpdateEvent } from '@/hooks/useMutateEvent';
import { useAppStore } from '@/store/appStore';
import { useTheme } from '@/hooks/useTheme';
import { EventForm } from '@/components/EventForm';
import { normalizeEvent, normalizeEvents } from '@/utils/normalizeEvent';
import type { CalendarEvent, CreateEventInput, RecurrenceEditScope } from '@/types';

export default function EditEventScreen() {
  const { uid, scope: scopeParam } = useLocalSearchParams<{ uid: string; scope?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const activeAccountId = useAppStore((s) => s.activeAccountId);
  const queryClient = useQueryClient();

  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: loadAccounts });
  const activeAccount = accounts?.find((a) => a.id === activeAccountId) ?? null;
  const { data: calendars = [] } = useCalendars(activeAccount);

  const cachedEvent = useMemo((): CalendarEvent | undefined => {
    const allCached = queryClient.getQueriesData<CalendarEvent[]>({
      queryKey: [activeAccountId, 'events'],
    });
    for (const [, data] of allCached) {
      if (!Array.isArray(data)) continue;
      const found = data.find((e) => e.uid === uid);
      if (found) return normalizeEvent(found);
    }
    return undefined;
  }, [queryClient, activeAccountId, uid]);

  const start = useMemo(() => dayjs().subtract(6, 'months').toDate(), []);
  const end = useMemo(() => dayjs().add(6, 'months').toDate(), []);

  const { data: fetchedEvents = [], isLoading: eventsLoading } = useQuery<CalendarEvent[]>({
    queryKey: [activeAccountId, 'events-detail', start.toISOString(), end.toISOString()],
    queryFn: async () => {
      if (!activeAccount || calendars.length === 0) return [];
      const results = await Promise.all(
        calendars.map((cal) => fetchEvents(activeAccount, cal, start, end))
      );
      return results.flat();
    },
    enabled: activeAccount !== null && calendars.length > 0 && cachedEvent === undefined,
    staleTime: 2 * 60 * 1000,
  });

  const event: CalendarEvent | undefined = cachedEvent ?? normalizeEvents(fetchedEvents).find((e) => e.uid === uid);

  const scope: RecurrenceEditScope =
    scopeParam === 'this' ? 'this'
    : scopeParam === 'thisAndFollowing' ? 'thisAndFollowing'
    : 'all';

  const updateMutation = useUpdateEvent(activeAccount!, calendars);

  async function handleSubmit(input: CreateEventInput) {
    if (!activeAccount || !event) return;
    try {
      await updateMutation.mutateAsync({ event, input, scope });
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/calendar');
    } catch (e: any) {
      const msg = e?.message ?? '';
      Alert.alert(
        'Failed to update event',
        msg.includes('403') ? 'Permission denied. This calendar is read-only or shared without write access.' : (msg || 'Unknown error.')
      );
    }
  }

  const isLoading = eventsLoading && cachedEvent === undefined;

  if (isLoading || !activeAccount || calendars.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textSecondary }}>Event not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: theme.primary }}>← Back</Text>
        </TouchableOpacity>
      </View>
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
    scope === 'this' ? ' (This Occurrence)'
    : scope === 'thisAndFollowing' ? ' (This & Following)'
    : '';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.headerBackground }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.cancel, { color: theme.primary }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          Edit Event{scopeLabel}
        </Text>
        <View style={styles.spacer} />
      </View>
      <EventForm
        calendars={calendars}
        organizerEmail={organizerEmail}
        organizerName={activeAccount.displayName}
        onSubmit={handleSubmit}
        loading={updateMutation.isPending}
        initialValues={initialValues}
        submitLabel="Update Event"
        disableCalendarChange
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  title: { fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' },
  cancel: { fontSize: 17, minWidth: 60 },
  spacer: { width: 60 },
});
