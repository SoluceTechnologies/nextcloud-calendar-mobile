import { useMemo } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { loadAccounts } from '@/api/auth';
import { useCalendars } from '@/hooks/useCalendars';
import { useCreateEvent } from '@/hooks/useMutateEvent';
import { useAppStore } from '@/store/appStore';
import { useTheme } from '@/hooks/useTheme';
import { EventForm } from '@/components/EventForm';
import type { CreateEventInput } from '@/types';

export default function NewEventScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const activeAccountId = useAppStore((s) => s.activeAccountId);

  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: loadAccounts });
  const activeAccount = accounts?.find((a) => a.id === activeAccountId) ?? null;
  const { data: calendars = [] } = useCalendars(activeAccount);

  const defaultDate = useMemo(() => (date ? new Date(date) : new Date()), [date]);

  const createMutation = useCreateEvent(activeAccount!, calendars);

  async function handleSubmit(input: CreateEventInput) {
    if (!activeAccount) return;
    try {
      await createMutation.mutateAsync(input);
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/calendar');
    } catch (e: any) {
      const msg = e?.message ?? '';
      Alert.alert(
        'Failed to create event',
        msg.includes('403') ? 'Permission denied. This calendar is read-only or shared without write access.' : (msg || 'Unknown error.')
      );
    }
  }

  if (!activeAccount || calendars.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textSecondary }}>Loading calendars…</Text>
      </View>
    );
  }

  const organizerEmail = activeAccount.username.includes('@')
    ? activeAccount.username
    : `${activeAccount.username}@${new URL(activeAccount.baseUrl).hostname}`;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.headerBackground }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.cancel, { color: theme.primary }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>New Event</Text>
        <View style={styles.spacer} />
      </View>
      <EventForm
        calendars={calendars}
        defaultDate={defaultDate}
        organizerEmail={organizerEmail}
        organizerName={activeAccount.displayName}
        onSubmit={handleSubmit}
        loading={createMutation.isPending}
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
  title: { fontSize: 17, fontWeight: '600' },
  cancel: { fontSize: 17 },
  spacer: { width: 60 },
});
