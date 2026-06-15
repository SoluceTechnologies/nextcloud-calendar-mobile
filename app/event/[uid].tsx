import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { loadAccounts } from '@/api/auth';
import { fetchEvents } from '@/api/caldav';
import { useCalendars } from '@/hooks/useCalendars';
import { useDeleteEvent } from '@/hooks/useMutateEvent';
import { useAppStore } from '@/store/appStore';
import { useTheme } from '@/hooks/useTheme';
import { normalizeEvent, normalizeEvents } from '@/utils/normalizeEvent';
import { EVENTS_STALE } from '@/api/queryConfig';
import type { CalendarEvent, RecurrenceEditScope } from '@/types';

async function openTalkRoom(talkUrl: string) {
  await Linking.openURL(talkUrl);
}

function askRecurrenceScope(title: string, onSelect: (scope: RecurrenceEditScope) => void) {
  Alert.alert(title, 'Which events do you want to modify?', [
    {
      text: 'This event only',
      onPress: () => onSelect('this'),
    },
    {
      text: 'This and following events',
      onPress: () => onSelect('thisAndFollowing'),
    },
    {
      text: 'All events',
      onPress: () => onSelect('all'),
    },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

export default function EventDetailScreen() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const activeAccountId = useAppStore((s) => s.activeAccountId);
  const queryClient = useQueryClient();

  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: loadAccounts });
  const activeAccount = accounts?.find((a) => a.id === activeAccountId) ?? null;
  const { data: calendars = [] } = useCalendars(activeAccount);

  const findInCache = useCallback((): CalendarEvent | undefined => {
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

  const findInCacheRef = useRef(findInCache);
  findInCacheRef.current = findInCache;

  const [cachedEvent, setCachedEvent] = useState<CalendarEvent | undefined>(() => findInCache());

  useEffect(() => {
    return queryClient.getQueryCache().subscribe((evt) => {
      const key = evt?.query?.queryKey;
      if (!Array.isArray(key) || key[0] !== activeAccountId || key[1] !== 'events') return;
      setCachedEvent((prev) => {
        const next = findInCacheRef.current();
        if (!next) return prev;
        if (prev?.uid === next.uid && prev?.summary === next.summary &&
            prev?.dtstart?.getTime?.() === next?.dtstart?.getTime?.()) return prev;
        return next;
      });
    });
  }, [queryClient, activeAccountId]);

  const start = useMemo(() => dayjs().subtract(3, 'months').toDate(), []);
  const end = useMemo(() => dayjs().add(3, 'months').toDate(), []);

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
    staleTime: EVENTS_STALE,
  });

  const event: CalendarEvent | undefined = cachedEvent ?? normalizeEvents(fetchedEvents).find((e) => e.uid === uid);
  const calendar = calendars.find((c) => c.id === event?.calendarId);
  const deleteMutation = useDeleteEvent(activeAccount!);
  const canEdit = !calendar?.isReadOnly && !calendar?.isSubscribed;

  function handleEdit() {
    if (!event) return;
    if (event.isRecurring) {
      askRecurrenceScope('Edit Event', (scope) => {
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
        'Delete Event',
        scope === 'all'
          ? 'Delete all occurrences of this recurring event?'
          : scope === 'thisAndFollowing'
          ? 'Delete this and all following occurrences?'
          : 'Are you sure you want to delete this event?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete', style: 'destructive',
            onPress: () => {
              // Optimistic: the event disappears from the calendar at once
              // (onMutate), and we leave immediately. A server failure rolls the
              // deletion back and alerts globally (see src/api/queryClient.ts).
              deleteMutation.mutate({ event, scope });
              if (router.canGoBack()) router.back();
              else router.replace('/(tabs)/calendar');
            },
          },
        ]
      );
    };

    if (event.isRecurring) {
      askRecurrenceScope('Delete Event', doDelete);
    } else {
      doDelete('all');
    }
  }

  const isLoading = eventsLoading && cachedEvent === undefined;

  if (isLoading) {
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

  const timeStr = event.allDay
    ? 'All day'
    : `${dayjs(event.dtstart).format('MMM D, YYYY h:mm A')} – ${dayjs(event.dtend).format('h:mm A')}`;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 16 }}
    >
      <View style={[styles.colorBar, { backgroundColor: event.color, marginTop: insets.top }]} />
      <View style={[styles.content, styles.contentFlex]}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.backText, { color: theme.primary }]}>← Back</Text>
          </TouchableOpacity>
          {canEdit && (
            <TouchableOpacity onPress={handleEdit}>
              <Text style={[styles.editText, { color: theme.primary }]}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={[styles.summary, { color: theme.text }]}>{event.summary}</Text>
        <Text style={[styles.meta, { color: theme.textSecondary }]}>{timeStr}</Text>
        {event.isRecurring && (
          <Text style={[styles.recurringBadge, { color: theme.primary }]}>↻ Recurring</Text>
        )}
        {calendar && (
          <Text style={[styles.calendarName, { color: theme.textTertiary }]}>
            📅 {calendar.displayName}
          </Text>
        )}

        {event.location && !event.talkUrl && (
          <Text style={[styles.field, { color: theme.textSecondary }]}>📍 {event.location}</Text>
        )}

        {event.talkUrl && (
          <TouchableOpacity
            style={[styles.talkBtn, { backgroundColor: theme.talk }]}
            onPress={() => openTalkRoom(event.talkUrl!)}
          >
            <Text style={styles.talkBtnText}>💬 Join Talk Room</Text>
          </TouchableOpacity>
        )}

        {event.description && (
          <View style={[styles.section, { borderTopColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>Description</Text>
            <Text style={[styles.sectionBody, { color: theme.textSecondary }]}>{event.description}</Text>
          </View>
        )}

        {event.attendees.length > 0 && (
          <View style={[styles.section, { borderTopColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>Attendees</Text>
            {event.attendees.map((att) => (
              <Text key={att.email} style={[styles.attendee, { color: theme.textSecondary }]}>
                {att.displayName ? `${att.displayName} (${att.email})` : att.email}
              </Text>
            ))}
          </View>
        )}

        <View style={styles.spacer} />

        {canEdit && (
          <TouchableOpacity
            style={[styles.deleteBtn, { borderColor: theme.danger }]}
            onPress={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending
              ? <ActivityIndicator color={theme.danger} />
              : <Text style={[styles.deleteBtnText, { color: theme.danger }]}>Delete Event</Text>}
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  contentFlex: { flex: 1 },
  spacer: { flex: 1, minHeight: 40 },
  colorBar: { height: 6 },
  content: { padding: 20 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  backText: { fontSize: 16 },
  editText: { fontSize: 16, fontWeight: '600' },
  summary: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  meta: { fontSize: 15, marginBottom: 4 },
  recurringBadge: { fontSize: 13, marginBottom: 4 },
  calendarName: { fontSize: 14, marginBottom: 16 },
  field: { fontSize: 15, marginBottom: 12 },
  talkBtn: {
    borderRadius: 8, paddingVertical: 12,
    alignItems: 'center', marginBottom: 16,
  },
  talkBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  section: { marginTop: 20, paddingTop: 20, borderTopWidth: StyleSheet.hairlineWidth },
  sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  sectionBody: { fontSize: 15, lineHeight: 22 },
  attendee: { fontSize: 14, marginBottom: 4 },
  deleteBtn: {
    marginTop: 40, borderWidth: 1,
    borderRadius: 8, paddingVertical: 12, alignItems: 'center',
  },
  deleteBtnText: { fontSize: 15, fontWeight: '600' },
});
