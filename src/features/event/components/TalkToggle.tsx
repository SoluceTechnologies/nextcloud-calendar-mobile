import { View, Text, Switch, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import { useAccountStore } from '@/stores/accountStore';
import type { TalkRoomType } from '@/types';

interface Props {
  value: boolean;
  onChange: (v: boolean) => void;
  roomType: TalkRoomType;
  onRoomTypeChange: (type: TalkRoomType) => void;
}

export function TalkToggle({ value, onChange, roomType, onRoomTypeChange }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const talkEnabled = useAccountStore((s) => s.capabilities.talkEnabled);

  if (!talkEnabled) return null;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.textContainer}>
          <Text style={[styles.label, { color: theme.colors.text }]}>{t('event.talkCreateRoom')}</Text>
          {value && (
            <Text style={[styles.hint, { color: theme.colors.textSecondary }]}>
              {t('event.talkRoomHint')}
            </Text>
          )}
        </View>
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
          thumbColor="#fff"
        />
      </View>

      {value && (
        <View style={styles.typeRow}>
          {(['private', 'public'] as TalkRoomType[]).map((roomTypeOption) => {
            const active = roomType === roomTypeOption;
            return (
              <TouchableOpacity
                key={roomTypeOption}
                style={[
                  styles.typePill,
                  { backgroundColor: active ? theme.colors.primary : theme.colors.chip },
                ]}
                onPress={() => onRoomTypeChange(roomTypeOption)}
              >
                <Text style={[styles.typePillText, { color: active ? '#fff' : theme.colors.textSecondary }]}>
                  {roomTypeOption === 'private' ? t('event.talkInviteOnly') : t('event.talkPublicLink')}
                </Text>
              </TouchableOpacity>
            );
          })}
          <Text style={[styles.typeHint, { color: theme.colors.textTertiary }]}>
            {roomType === 'public'
              ? t('event.talkAnyoneWithLink')
              : t('event.talkOnlyInvited')}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
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
