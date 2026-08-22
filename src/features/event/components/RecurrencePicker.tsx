import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import { DateField, TextField } from '@/ui/components';
import type { RecurrenceFreq, RecurrenceRule } from '@/types';

type EndMode = 'never' | 'count' | 'until';

const DEFAULT_COUNT = 10;

function untilAnchor(date: Date, allDay: boolean): Date {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  return allDay ? new Date(y, m, d) : new Date(y, m, d, 23, 59, 59);
}

interface Props {
  value: RecurrenceRule | undefined;
  onChange: (rule: RecurrenceRule | undefined) => void;
  dtstart: Date;
  allDay?: boolean;
}

export function RecurrencePicker({ value, onChange, dtstart, allDay = false }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [showUntilPicker, setShowUntilPicker] = useState(false);

  const FREQS: { label: string; value: RecurrenceFreq | null }[] = [
    { label: t('event.freqNone'), value: null },
    { label: t('event.freqDaily'), value: 'DAILY' },
    { label: t('event.freqWeekly'), value: 'WEEKLY' },
    { label: t('event.freqMonthly'), value: 'MONTHLY' },
    { label: t('event.freqYearly'), value: 'YEARLY' },
  ];

  const WEEKDAYS = [
    { label: t('event.daySu'), value: 'SU' },
    { label: t('event.dayMo'), value: 'MO' },
    { label: t('event.dayTu'), value: 'TU' },
    { label: t('event.dayWe'), value: 'WE' },
    { label: t('event.dayTh'), value: 'TH' },
    { label: t('event.dayFr'), value: 'FR' },
    { label: t('event.daySa'), value: 'SA' },
  ];

  const END_MODES: { label: string; value: EndMode }[] = [
    { label: t('event.endsNever'), value: 'never' },
    { label: t('event.endsAfter'), value: 'count' },
    { label: t('event.endsOn'), value: 'until' },
  ];

  const selectedFreq = value?.freq ?? null;
  const endMode: EndMode = value?.count ? 'count' : value?.until ? 'until' : 'never';
  const untilDate = value?.until ?? untilAnchor(dayjs(dtstart).add(1, 'month').toDate(), allDay);

  function handleFreqSelect(freq: RecurrenceFreq | null) {
    if (freq === null) {
      onChange(undefined);
      return;
    }

    onChange({
      ...value,
      freq,
      interval: 1,
      byDay: freq === 'WEEKLY' ? value?.byDay : undefined,
    });
  }

  function toggleByDay(day: string) {
    if (!value) return;
    const current = value.byDay ?? [];
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    onChange({ ...value, byDay: next.length > 0 ? next : undefined });
  }

  function handleEndModeSelect(mode: EndMode) {
    if (!value) return;
    if (mode === 'never') onChange({ ...value, count: undefined, until: undefined });
    else if (mode === 'count') onChange({ ...value, count: DEFAULT_COUNT, until: undefined });
    else onChange({ ...value, count: undefined, until: untilDate });
  }

  function handleCountChange(raw: string) {
    if (!value) return;
    const digits = raw.replace(/[^0-9]/g, '');
    const parsed = Number(digits);
    onChange({ ...value, count: digits === '' || parsed < 1 ? 1 : parsed, until: undefined });
  }

  function handleUntilChange(_: unknown, selected?: Date) {
    if (Platform.OS === 'android') setShowUntilPicker(false);
    if (!selected || !value) return;
    onChange({ ...value, until: untilAnchor(selected, allDay), count: undefined });
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>{t('event.repeat')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
        {FREQS.map(({ label, value: freq }) => {
          const active = selectedFreq === freq;
          return (
            <TouchableOpacity
              key={label}
              style={[
                styles.pill,
                { backgroundColor: active ? theme.colors.primary : theme.colors.chip },
              ]}
              onPress={() => handleFreqSelect(freq)}
            >
              <Text style={[styles.pillText, { color: active ? '#fff' : theme.colors.textSecondary }]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {value?.freq === 'WEEKLY' && (
        <View>
          <Text style={[styles.subLabel, { color: theme.colors.textTertiary }]}>{t('event.onDays')}</Text>
          <View style={styles.dayRow}>
            {WEEKDAYS.map(({ label, value: day }) => {
              const active = value.byDay?.includes(day) ?? false;
              return (
                <TouchableOpacity
                  key={day}
                  style={[
                    styles.dayChip,
                    { backgroundColor: active ? theme.colors.primary : theme.colors.chip },
                  ]}
                  onPress={() => toggleByDay(day)}
                >
                  <Text style={[styles.dayChipText, { color: active ? '#fff' : theme.colors.textSecondary }]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {value && (
        <View>
          <Text style={[styles.subLabel, { color: theme.colors.textTertiary }]}>{t('event.ends')}</Text>
          <View style={styles.pillRow}>
            {END_MODES.map(({ label, value: mode }) => {
              const active = endMode === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.pill,
                    { backgroundColor: active ? theme.colors.primary : theme.colors.chip },
                  ]}
                  onPress={() => handleEndModeSelect(mode)}
                >
                  <Text style={[styles.pillText, { color: active ? '#fff' : theme.colors.textSecondary }]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {endMode === 'count' && (
            <View style={styles.endDetail}>
              <View style={styles.countField}>
                <TextField
                  value={String(value.count ?? DEFAULT_COUNT)}
                  onChangeText={handleCountChange}
                  keyboardType="number-pad"
                  maxLength={4}
                  accessibilityLabel={t('event.occurrences')}
                />
              </View>
              <Text style={[styles.countSuffix, { color: theme.colors.textSecondary }]}>
                {t('event.occurrences')}
              </Text>
            </View>
          )}

          {endMode === 'until' && (
            <View style={styles.endDetail}>
              {Platform.OS === 'ios' ? (
                <DateTimePicker
                  testID="recurrence-until-picker"
                  value={untilDate}
                  mode="date"
                  display="compact"
                  minimumDate={dtstart}
                  accentColor={theme.colors.primary}
                  onChange={handleUntilChange}
                />
              ) : (
                <View style={styles.grow}>
                  <DateField
                    value={dayjs(untilDate).format('ddd ll')}
                    onPress={() => setShowUntilPicker(true)}
                  />
                  {showUntilPicker && (
                    <DateTimePicker
                      testID="recurrence-until-picker"
                      value={untilDate}
                      mode="date"
                      minimumDate={dtstart}
                      onChange={handleUntilChange}
                    />
                  )}
                </View>
              )}
            </View>
          )}
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
  endDetail: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  countField: { width: 80 },
  countSuffix: { fontSize: 14 },
  grow: { flex: 1 },
});
