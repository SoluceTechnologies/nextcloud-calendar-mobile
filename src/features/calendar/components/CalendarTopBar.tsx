import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Menu } from 'lucide-react-native';
import { useTheme } from 'expo-router';
import { Stack, Typography, Chip, Icon, AnimatedPressable } from '@/ui/components';
import type { ViewMode } from '@/types';
import { VIEW_MODES } from '../constants';

interface Props {
  headerTitle: string;
  isToday: boolean;
  viewMode: ViewMode;
  pendingInvitationsCount?: number;
  onOpenDrawer: () => void;
  onToday: () => void;
  onSwitchMode: (mode: ViewMode) => void;
}

const VIEW_MODE_KEYS: Record<ViewMode, string> = {
  month: 'calendar.month',
  week: 'calendar.week',
  '3days': 'calendar.threeDays',
  day: 'calendar.day',
  schedule: 'calendar.schedule',
};

function CalendarTopBarImpl({ headerTitle, isToday, viewMode, pendingInvitationsCount = 0, onOpenDrawer, onToday, onSwitchMode }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const todayDisabled = isToday;

  return (
    <SafeAreaView
      edges={['top']}
      style={{ backgroundColor: colors.headerBackground, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }}
    >
      <Stack direction="horizontal" vAlign="center" gap={0} style={styles.headerRow}>
        <Pressable onPress={onOpenDrawer} hitSlop={8} style={styles.hamburger}>
          <Icon size={24}>
            <Menu color={colors.primary} />
          </Icon>
          {pendingInvitationsCount > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.headerBackground }]} pointerEvents="none" />
          )}
        </Pressable>

        <Typography
          variant="body2"
          weight="700"
          color="text"
          align="center"
          nowrap
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={styles.title}
        >
          {headerTitle}
        </Typography>

        <AnimatedPressable
          onPress={onToday}
          disabled={todayDisabled}
          animated={!todayDisabled}
          style={[styles.todayBtn, { opacity: isToday ? 0.35 : 1 }]}
        >
          <Typography variant="body2" color="primary" nowrap adjustsFontSizeToFit minimumFontScale={0.8}>
            {t('calendar.today')}
          </Typography>
        </AnimatedPressable>
      </Stack>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
        {VIEW_MODES.map((mode) => (
          <Chip key={mode} rounded small active={viewMode === mode} activeColor={colors.chipActive} onPress={() => onSwitchMode(mode)}>
            {t(VIEW_MODE_KEYS[mode])}
          </Chip>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

export const CalendarTopBar = memo(CalendarTopBarImpl);

const styles = StyleSheet.create({
  headerRow: { height: 44, paddingHorizontal: 12, paddingBottom: 4, alignItems: 'center' },
  hamburger: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -4 },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  title: { flex: 1, marginHorizontal: 4 },
  todayBtn: { minWidth: 44, height: 44, paddingLeft: 6, alignItems: 'flex-end', justifyContent: 'center' },
  pills: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
});
