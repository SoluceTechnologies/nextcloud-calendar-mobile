import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AlarmOffsetPicker } from '@/features/notifications/AlarmOffsetPicker';

interface Props {
  /** undefined = "Default", [] = "None", otherwise explicit minute offsets. */
  value: number[] | undefined;
  onChange: (value: number[] | undefined) => void;
}

export function AlertPicker({ value, onChange }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();

  const isDefault = value === undefined;
  const isNone = value?.length === 0;

  const exclusives: { label: string; active: boolean; select: () => void }[] = [
    { label: t('settings.alerts.useDefault'), active: isDefault, select: () => onChange(undefined) },
    { label: t('settings.alerts.none'), active: isNone, select: () => onChange([]) },
  ];

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>{t('event.alerts')}</Text>
      <AlarmOffsetPicker
        values={value ?? []}
        onChange={(next) => onChange(next)}
        leading={exclusives.map(({ label, active, select }) => (
          <TouchableOpacity
            key={label}
            style={[
              styles.pill,
              { backgroundColor: active ? theme.colors.primary : theme.colors.chip },
            ]}
            onPress={select}
          >
            <Text style={[styles.pillText, { color: active ? '#fff' : theme.colors.textSecondary }]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 16 },
  sectionLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  pillText: { fontSize: 14 },
});
