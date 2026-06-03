import { View, Text, Switch, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useAppStore } from '@/store/appStore';
import type { TalkRoomType } from '@/types';

interface Props {
  value: boolean;
  onChange: (v: boolean) => void;
  roomType: TalkRoomType;
  onRoomTypeChange: (t: TalkRoomType) => void;
}

export function TalkToggle({ value, onChange, roomType, onRoomTypeChange }: Props) {
  const theme = useTheme();
  const talkEnabled = useAppStore((s) => s.capabilities.talkEnabled);

  if (!talkEnabled) return null;

  return (
    <View style={[styles.container, { borderBottomColor: theme.border }]}>
      <View style={styles.topRow}>
        <View style={styles.textContainer}>
          <Text style={[styles.label, { color: theme.text }]}>Create Talk Room</Text>
          {value && (
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              A Talk room will be created and added to the event.
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

      {value && (
        <View style={styles.typeRow}>
          {(['private', 'public'] as TalkRoomType[]).map((t) => {
            const active = roomType === t;
            return (
              <TouchableOpacity
                key={t}
                style={[
                  styles.typePill,
                  { backgroundColor: active ? theme.primary : theme.chip },
                ]}
                onPress={() => onRoomTypeChange(t)}
              >
                <Text style={[styles.typePillText, { color: active ? '#fff' : theme.textSecondary }]}>
                  {t === 'private' ? 'Invite only' : 'Public link'}
                </Text>
              </TouchableOpacity>
            );
          })}
          <Text style={[styles.typeHint, { color: theme.textTertiary }]}>
            {roomType === 'public'
              ? 'Anyone with the link can join'
              : 'Only invited participants'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textContainer: { flex: 1, marginRight: 12 },
  label: { fontSize: 16 },
  hint: { fontSize: 13, marginTop: 4 },
  typeRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  typePill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14 },
  typePillText: { fontSize: 13, fontWeight: '500' },
  typeHint: { fontSize: 12, marginLeft: 4 },
});
