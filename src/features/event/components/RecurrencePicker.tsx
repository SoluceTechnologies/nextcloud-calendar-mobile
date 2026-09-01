import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import { DateField, Select, TextField } from '@/ui/components';
import type { RecurrenceFreq, RecurrenceRule } from '@/types';
import {
  formatByDay,
  hasPositionInByDay,
  isoWeekNumber,
  monthFromDate,
  monthName,
  parseByDay,
  positionInMonth,
  weekdayFromDate,
  defaultYearlyMonthPositionRule,
  defaultYearlyWeekNumberRule,
  type MonthlyMode,
  type Position,
  type Weekday,
  type YearlyMode,
} from '@/features/event/utils/recurrencePattern';

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
  const { t, i18n } = useTranslation();
  const [showUntilPicker, setShowUntilPicker] = useState(false);

  const FREQS: { label: string; value: RecurrenceFreq | null }[] = [
    { label: t('event.freqNone'), value: null },
    { label: t('event.freqDaily'), value: 'DAILY' },
    { label: t('event.freqWeekly'), value: 'WEEKLY' },
    { label: t('event.freqMonthly'), value: 'MONTHLY' },
    { label: t('event.freqYearly'), value: 'YEARLY' },
  ];

  const WEEKDAY_OPTIONS = [
    { label: t('event.daySu'), value: 'SU' as Weekday },
    { label: t('event.dayMo'), value: 'MO' as Weekday },
    { label: t('event.dayTu'), value: 'TU' as Weekday },
    { label: t('event.dayWe'), value: 'WE' as Weekday },
    { label: t('event.dayTh'), value: 'TH' as Weekday },
    { label: t('event.dayFr'), value: 'FR' as Weekday },
    { label: t('event.daySa'), value: 'SA' as Weekday },
  ];

  const POSITION_OPTIONS = [
    { label: t('event.positionFirst'), value: 1 as Position },
    { label: t('event.positionSecond'), value: 2 as Position },
    { label: t('event.positionThird'), value: 3 as Position },
    { label: t('event.positionFourth'), value: 4 as Position },
    { label: t('event.positionFifth'), value: 5 as Position },
    { label: t('event.positionLast'), value: -1 as Position },
  ];

  const MONTH_OPTIONS = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        value: i + 1,
        label: monthName(i + 1, i18n.language),
      })),
    [i18n.language],
  );

  const END_MODES: { label: string; value: EndMode }[] = [
    { label: t('event.endsNever'), value: 'never' },
    { label: t('event.endsAfter'), value: 'count' },
    { label: t('event.endsOn'), value: 'until' },
  ];

  const selectedFreq = value?.freq ?? null;
  const endMode: EndMode = value?.count ? 'count' : value?.until ? 'until' : 'never';
  const untilDate = value?.until ?? untilAnchor(dayjs(dtstart).add(1, 'month').toDate(), allDay);

  const monthlyMode: MonthlyMode =
    value?.freq === 'MONTHLY' && hasPositionInByDay(value) ? 'weekdayPosition' : 'date';

  const yearlyMode: YearlyMode =
    value?.freq === 'YEARLY'
      ? value.byWeekNo?.length
        ? 'weekNumber'
        : value.byMonth?.length
          ? 'monthPosition'
          : 'date'
      : 'date';

  function handleFreqSelect(freq: RecurrenceFreq | null) {
    if (freq === null) {
      onChange(undefined);
      return;
    }

    const { count, until } = value ?? {};
    const base = { freq, interval: 1, count, until };

    if (freq === 'WEEKLY') {
      onChange({ ...base, byDay: [weekdayFromDate(dtstart)] });
    } else {
      onChange(base as RecurrenceRule);
    }
  }

  function toggleByDay(day: Weekday) {
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

  function handleMonthlyModeSelect(mode: MonthlyMode) {
    if (!value) return;
    if (mode === 'date') {
      onChange({ ...value, byDay: undefined });
      return;
    }
    if (monthlyMode !== 'weekdayPosition') {
      onChange({ ...value, byDay: [formatByDay(positionInMonth(dtstart), weekdayFromDate(dtstart))] });
    }
  }

  function handleYearlyModeSelect(mode: YearlyMode) {
    if (!value) return;
    if (mode === 'date') {
      onChange({ ...value, byMonth: undefined, byWeekNo: undefined, byDay: undefined });
      return;
    }
    if (mode === 'monthPosition') {
      const current = value.byDay?.[0] ?? '';
      const parsed = parseByDay(current);
      if (yearlyMode !== 'monthPosition' || !parsed?.position || !value.byMonth?.length) {
        onChange({ ...value, ...defaultYearlyMonthPositionRule(dtstart), byWeekNo: undefined });
      }
      return;
    }
    const current = value.byDay?.[0] ?? '';
    const parsed = parseByDay(current);
    const weekday = parsed?.weekday ?? weekdayFromDate(dtstart);
    const weekNo = value.byWeekNo?.[0] ?? isoWeekNumber(dtstart);
    onChange({
      ...value,
      byWeekNo: [weekNo],
      byDay: [weekday],
      byMonth: undefined,
    });
  }

  function selectedByDay() {
    const current = value?.byDay?.[0] ?? formatByDay(positionInMonth(dtstart), weekdayFromDate(dtstart));
    return parseByDay(current) ?? { position: 1 as Position, weekday: weekdayFromDate(dtstart) };
  }

  function handlePositionChange(position: Position) {
    if (!value) return;
    const { weekday } = selectedByDay();
    onChange({ ...value, byDay: [formatByDay(position, weekday)] });
  }

  function handleWeekdayChange(weekday: Weekday) {
    if (!value) return;
    const parsed = parseByDay(value.byDay?.[0] ?? '');
    if (parsed?.position !== undefined && (value.freq === 'MONTHLY' || value.byMonth?.length)) {
      onChange({ ...value, byDay: [formatByDay(parsed.position, weekday)] });
    } else {
      onChange({ ...value, byDay: [weekday] });
    }
  }

  function handleMonthChange(month: number) {
    if (!value) return;
    onChange({ ...value, byMonth: [month] });
  }

  function handleWeekNoChange(raw: string) {
    if (!value) return;
    const digits = raw.replace(/\D/g, '');
    const parsed = digits === '' ? 1 : Math.min(53, Math.max(1, Number(digits)));
    onChange({ ...value, byWeekNo: [parsed] });
  }

  function renderModeSelect<T extends string>(
    label: string,
    options: { label: string; value: T }[],
    activeValue: T,
    onSelect: (value: T) => void,
  ) {
    return (
      <View>
        <Text style={[styles.subLabel, { color: theme.colors.textTertiary }]}>{label}</Text>
        <Select
          value={activeValue}
          options={options}
          onChange={onSelect}
          accessibilityLabel={label}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>{t('event.repeat')}</Text>
      <View style={styles.grow}>
        <Select
          value={selectedFreq}
          options={FREQS}
          onChange={handleFreqSelect}
          accessibilityLabel={t('event.repeat')}
        />
      </View>

      {value?.freq === 'WEEKLY' && (
        <View>
          <Text style={[styles.subLabel, { color: theme.colors.textTertiary }]}>{t('event.onDays')}</Text>
          <View style={styles.dayRow}>
            {WEEKDAY_OPTIONS.map(({ label, value: day }) => {
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

      {value?.freq === 'MONTHLY' &&
        renderModeSelect<MonthlyMode>(
          t('event.repeatOn'),
          [
            { label: t('event.sameDayOfMonth'), value: 'date' },
            { label: t('event.onAWeekday'), value: 'weekdayPosition' },
          ],
          monthlyMode,
          handleMonthlyModeSelect,
        )}

      {value?.freq === 'MONTHLY' && monthlyMode === 'weekdayPosition' && (
        <View style={styles.patternRow}>
          <View style={styles.grow}>
            <Select
              value={selectedByDay().position ?? 1}
              options={POSITION_OPTIONS}
              onChange={handlePositionChange}
              accessibilityLabel={t('event.positionLabel')}
            />
          </View>
          <View style={styles.grow}>
            <Select
              value={selectedByDay().weekday}
              options={WEEKDAY_OPTIONS}
              onChange={handleWeekdayChange}
              accessibilityLabel={t('event.weekdayLabel')}
            />
          </View>
        </View>
      )}

      {value?.freq === 'YEARLY' &&
        renderModeSelect<YearlyMode>(
          t('event.repeatOn'),
          [
            { label: t('event.sameDate'), value: 'date' },
            { label: t('event.onAWeekdayOfAMonth'), value: 'monthPosition' },
            { label: t('event.onAWeekNumber'), value: 'weekNumber' },
          ],
          yearlyMode,
          handleYearlyModeSelect,
        )}

      {value?.freq === 'YEARLY' && yearlyMode === 'monthPosition' && (
        <View>
          <View style={styles.patternRow}>
            <View style={styles.grow}>
              <Select
                value={selectedByDay().position ?? 1}
                options={POSITION_OPTIONS}
                onChange={handlePositionChange}
                accessibilityLabel={t('event.positionLabel')}
              />
            </View>
            <View style={styles.grow}>
              <Select
                value={selectedByDay().weekday}
                options={WEEKDAY_OPTIONS}
                onChange={handleWeekdayChange}
                accessibilityLabel={t('event.weekdayLabel')}
              />
            </View>
          </View>
          <View style={[styles.patternRow, { marginTop: 8 }]}>
            <Text style={[styles.patternLabel, { color: theme.colors.textSecondary }]}>{t('event.of')}</Text>
            <View style={styles.grow}>
              <Select
                value={value.byMonth?.[0] ?? monthFromDate(dtstart)}
                options={MONTH_OPTIONS}
                onChange={handleMonthChange}
                accessibilityLabel={t('event.monthLabel')}
              />
            </View>
          </View>
        </View>
      )}

      {value?.freq === 'YEARLY' && yearlyMode === 'weekNumber' && (
        <View style={styles.patternRow}>
          <View style={styles.weekNoField}>
            <TextField
              value={String(value.byWeekNo?.[0] ?? isoWeekNumber(dtstart))}
              onChangeText={handleWeekNoChange}
              keyboardType="number-pad"
              maxLength={2}
              accessibilityLabel={t('event.weekNumberLabel')}
            />
          </View>
          <Text style={[styles.patternLabel, { color: theme.colors.textSecondary }]}>{t('event.week')}</Text>
          <View style={styles.grow}>
            <Select
              value={selectedByDay().weekday}
              options={WEEKDAY_OPTIONS}
              onChange={handleWeekdayChange}
              accessibilityLabel={t('event.weekdayLabel')}
            />
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
                  <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.pillText, { color: active ? '#fff' : theme.colors.textSecondary }]}>
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
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  pillText: { fontSize: 13 },
  dayRow: { flexDirection: 'row', gap: 8 },
  dayChip: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayChipText: { fontSize: 12, fontWeight: '600' },
  patternRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  patternLabel: { fontSize: 14 },
  weekNoField: { width: 64 },
  endDetail: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  countField: { width: 80 },
  countSuffix: { fontSize: 14 },
  grow: { flex: 1 },
});
