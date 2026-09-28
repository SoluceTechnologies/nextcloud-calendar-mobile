import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { TIMED_ALERTS, timedAlertLabelKey } from '@/features/notifications/alerts';

interface Props {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}

export function AlertPicker({ value, onChange }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();

  const OFFSETS: { label: string; value: number | undefined }[] = [
    { label: t('settings.alerts.useDefault'), value: undefined },
    ...TIMED_ALERTS
      .filter((v): v is Exclude<typeof v, null> => v !== null)
      .map((minutes) => ({ label: t(timedAlertLabelKey(minutes)), value: minutes as number | undefined })),
  ];

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>{t('event.alert')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.pillRow}>
        {OFFSETS.map(({ label, value: minutes }) => {
          const active = value === minutes;
          return (
            <TouchableOpacity
              key={label}
              testID={`event-form-alert-${minutes ?? 'default'}`}
              style={[
                styles.pill,
                { backgroundColor: active ? theme.colors.primary : theme.colors.chip },
              ]}
              onPress={() => onChange(minutes)}
            >
              <Text style={[styles.pillText, { color: active ? '#fff' : theme.colors.textSecondary }]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 16 },
  sectionLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  pillRow: { flexDirection: 'row', gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  pillText: { fontSize: 14 },
});
