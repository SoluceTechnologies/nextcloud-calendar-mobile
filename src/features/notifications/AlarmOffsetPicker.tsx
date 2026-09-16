import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  ALL_DAY_ALERTS,
  TIMED_ALERTS,
  allDayAlertLabelKey,
  alertMinutesLabel,
  timedAlertLabelKey,
  type AllDayAlert,
  type TimedAlert,
} from './alerts';
import { Button, Chip, Dialog, TextField, Typography } from '@/ui/components';

type Unit = 'minutes' | 'hours' | 'days';

const UNIT_FACTOR: Record<Unit, number> = { minutes: 1, hours: 60, days: 1440 };

interface CustomDialogProps {
  visible: boolean;
  allDay: boolean;
  onClose: () => void;
  onAdd: (minutes: number) => void;
}

function CustomAlarmDialog({ visible, allDay, onClose, onAdd }: CustomDialogProps) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<Unit>(allDay ? 'days' : 'minutes');

  const value = parseInt(amount, 10);
  const valid = Number.isInteger(value) && value >= 0;

  function submit() {
    if (!valid) return;
    onAdd(allDay ? value : value * UNIT_FACTOR[unit]);
    setAmount('');
    onClose();
  }

  return (
    <Dialog visible={visible} onClose={onClose}>
      <Typography variant="body1">{t('settings.alerts.customTitle')}</Typography>
      <TextField
        label={t('settings.alerts.customAmount')}
        value={amount}
        onChangeText={setAmount}
        keyboardType="number-pad"
      />
      {!allDay && (
        <View style={styles.unitRow}>
          {(['minutes', 'hours', 'days'] as Unit[]).map((u) => (
            <Chip key={u} rounded small active={unit === u} onPress={() => setUnit(u)}>
              {t(`settings.alerts.units.${u}`)}
            </Chip>
          ))}
        </View>
      )}
      <Button
        variant="primary"
        title={t('settings.alerts.addReminder')}
        disabled={!valid}
        onPress={submit}
      />
    </Dialog>
  );
}

interface Props {
  values: number[];
  onChange: (values: number[]) => void;
  allDay?: boolean;
  leading?: ReactNode;
}

export function AlarmOffsetPicker({ values, onChange, allDay = false, leading }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [customOpen, setCustomOpen] = useState(false);

  const presets: number[] = ((allDay ? ALL_DAY_ALERTS : TIMED_ALERTS) as (number | null)[]).filter(
    (v): v is number => v !== null,
  );

  function labelOf(v: number): string {
    if (allDay) {
      return (ALL_DAY_ALERTS as number[]).includes(v)
        ? t(allDayAlertLabelKey(v as AllDayAlert))
        : t('settings.alerts.allDayOpts.custom', { value: v });
    }
    return (TIMED_ALERTS as number[]).includes(v)
      ? t(timedAlertLabelKey(v as TimedAlert))
      : alertMinutesLabel(v);
  }

  function toggle(minutes: number) {
    onChange(
      values.includes(minutes)
        ? values.filter((v) => v !== minutes)
        : [...values, minutes],
    );
  }

  const customValues = values.filter((v) => !presets.includes(v)).sort((a, b) => b - a);
  const pills = [...presets, ...customValues].sort((a, b) => b - a);

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
        {leading}
        {pills.map((minutes) => {
          const active = values.includes(minutes);
          return (
            <TouchableOpacity
              key={minutes}
              style={[
                styles.pill,
                { backgroundColor: active ? theme.colors.primary : theme.colors.chip },
              ]}
              onPress={() => toggle(minutes)}
            >
              <Text style={[styles.pillText, { color: active ? '#fff' : theme.colors.textSecondary }]}>
                {labelOf(minutes)}
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[styles.pill, { backgroundColor: theme.colors.chip }]}
          onPress={() => setCustomOpen(true)}
        >
          <Text style={[styles.pillText, { color: theme.colors.textSecondary }]}>
            {t('settings.alerts.addCustom')}
          </Text>
        </TouchableOpacity>
      </ScrollView>
      <CustomAlarmDialog
        visible={customOpen}
        allDay={allDay}
        onClose={() => setCustomOpen(false)}
        onAdd={(minutes) => toggle(minutes)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pillRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  pillText: { fontSize: 14 },
  unitRow: { flexDirection: 'row', gap: 8 },
});
