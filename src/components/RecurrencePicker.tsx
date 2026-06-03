import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import type { RecurrenceFreq, RecurrenceRule } from '@/types';

const FREQS: { label: string; value: RecurrenceFreq | null }[] = [
  { label: 'None', value: null },
  { label: 'Daily', value: 'DAILY' },
  { label: 'Weekly', value: 'WEEKLY' },
  { label: 'Monthly', value: 'MONTHLY' },
  { label: 'Yearly', value: 'YEARLY' },
];

const WEEKDAYS = [
  { label: 'Su', value: 'SU' },
  { label: 'Mo', value: 'MO' },
  { label: 'Tu', value: 'TU' },
  { label: 'We', value: 'WE' },
  { label: 'Th', value: 'TH' },
  { label: 'Fr', value: 'FR' },
  { label: 'Sa', value: 'SA' },
];

interface Props {
  value: RecurrenceRule | undefined;
  onChange: (rule: RecurrenceRule | undefined) => void;
}

export function RecurrencePicker({ value, onChange }: Props) {
  const theme = useTheme();

  const selectedFreq = value?.freq ?? null;

  function handleFreqSelect(freq: RecurrenceFreq | null) {
    if (freq === null) {
      onChange(undefined);
    } else {
      onChange({ freq, interval: 1 });
    }
  }

  function toggleByDay(day: string) {
    if (!value) return;
    const current = value.byDay ?? [];
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    onChange({ ...value, byDay: next.length > 0 ? next : undefined });
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Repeat</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
        {FREQS.map(({ label, value: freq }) => {
          const active = selectedFreq === freq;
          return (
            <TouchableOpacity
              key={label}
              style={[
                styles.pill,
                { backgroundColor: active ? theme.primary : theme.chip },
              ]}
              onPress={() => handleFreqSelect(freq)}
            >
              <Text style={[styles.pillText, { color: active ? '#fff' : theme.textSecondary }]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {value?.freq === 'WEEKLY' && (
        <View>
          <Text style={[styles.subLabel, { color: theme.textTertiary }]}>On days</Text>
          <View style={styles.dayRow}>
            {WEEKDAYS.map(({ label, value: day }) => {
              const active = value.byDay?.includes(day) ?? false;
              return (
                <TouchableOpacity
                  key={day}
                  style={[
                    styles.dayChip,
                    { backgroundColor: active ? theme.primary : theme.chip },
                  ]}
                  onPress={() => toggleByDay(day)}
                >
                  <Text style={[styles.dayChipText, { color: active ? '#fff' : theme.textSecondary }]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 16 },
  sectionLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  subLabel: { fontSize: 12, marginBottom: 6, marginTop: 8 },
  pillRow: { flexDirection: 'row', gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  pillText: { fontSize: 14 },
  dayRow: { flexDirection: 'row', gap: 8 },
  dayChip: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayChipText: { fontSize: 12, fontWeight: '600' },
});
