import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import Typography from './Typography';

interface DateFieldProps {
  label?: string;
  value: string;
  time?: string;
  onPress: () => void;
  error?: string;
  disabled?: boolean;
  testID?: string;
}

function DateField({ label, value, time, onPress, error, disabled, testID }: DateFieldProps) {
  const { colors, radius } = useTheme();

  return (
    <View style={styles.container}>
      {label ? (
        <Typography variant="body2" color="secondary" style={styles.label}>
          {label}
        </Typography>
      ) : null}
      <Pressable
        testID={testID}
        onPress={onPress}
        disabled={disabled}
        style={[
          styles.field,
          {
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            borderColor: error ? colors.danger : colors.border,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        <Typography variant="body1" style={[styles.value, { color: colors.text }]}>
          {value}
        </Typography>
        {time ? (
          <Typography variant="body1" style={[styles.time, { color: colors.text }]}>
            {time}
          </Typography>
        ) : null}
      </Pressable>
      {error ? (
        <Typography testID={testID ? `${testID}-error` : undefined} variant="caption" color="danger" style={styles.error}>
          {error}
        </Typography>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: 6 },
  label: { marginLeft: 2 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  value: { flex: 1, paddingVertical: 12, fontSize: 15 },
  time: { paddingVertical: 12, fontSize: 15, fontWeight: '600', marginLeft: 8 },
  error: { marginLeft: 2 },
});

export default React.memo(DateField);
