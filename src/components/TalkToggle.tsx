import { View, Text, Switch, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

interface Props {
  value: boolean;
  onChange: (v: boolean) => void;
}

export function TalkToggle({ value, onChange }: Props) {
  const theme = useTheme();
  return (
    <View style={[styles.container, { borderBottomColor: theme.border }]}>
      <View style={styles.textContainer}>
        <Text style={[styles.label, { color: theme.text }]}>Create Talk Room</Text>
        {value && (
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            A Talk room will be created automatically and added to the event.
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.border, true: theme.primary }}
        thumbColor="#fff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1,
  },
  textContainer: { flex: 1, marginRight: 12 },
  label: { fontSize: 16 },
  hint: { fontSize: 13, marginTop: 4 },
});
