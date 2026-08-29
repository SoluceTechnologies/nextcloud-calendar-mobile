import { memo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Menu } from 'lucide-react-native';
import { useTheme } from 'expo-router';
import { Stack, Typography, Chip, Icon, AnimatedPressable } from '@/ui/components';
import { useNotificationStore } from '@/stores/notificationStore';
import type { ViewMode } from '@/types';
import { VIEW_MODES } from '../constants';

interface Props {
  headerTitle: string;
  isToday: boolean;
  viewMode: ViewMode;
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

function CalendarTopBarImpl({ headerTitle, isToday, viewMode, onOpenDrawer, onToday, onSwitchMode }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const todayDisabled = isToday;
  const calendarUnreadCount = useNotificationStore(
    (s) => s.notifications.filter((n) => (n.app === 'calendar' || n.app === 'event_update_notification') && !n.seen).length,
  );

  return (
    <SafeAreaView
      edges={['top']}
      style={{ backgroundColor: colors.headerBackground, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }}
    >
      <Stack direction="horizontal" vAlign="center" gap={0} style={styles.headerRow}>
        <AnimatedPressable onPress={onOpenDrawer} hitSlop={8} style={styles.hamburger}>
          <View style={{ position: 'relative', width: 24, height: 24 }}>
            <Icon size={24}>
              <Menu color={colors.primary} />
            </Icon>
            {calendarUnreadCount > 0 && (
              <View
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  minWidth: 14,
                  height: 14,
                  borderRadius: 7,
                  zIndex: 10,
                  backgroundColor: colors.notification,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Typography variant="caption" color="primaryText" style={{ fontSize: 8, lineHeight: 12, paddingHorizontal: 3 }}>
                  {calendarUnreadCount > 99 ? '99+' : String(calendarUnreadCount)}
                </Typography>
              </View>
            )}
          </View>
        </AnimatedPressable>

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
  title: { flex: 1, marginHorizontal: 4 },
  todayBtn: { minWidth: 44, height: 44, paddingLeft: 6, alignItems: 'flex-end', justifyContent: 'center' },
  pills: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
});
