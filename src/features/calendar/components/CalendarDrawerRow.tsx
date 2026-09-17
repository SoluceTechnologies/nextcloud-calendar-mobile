import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Bell, BellOff, Cake } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';

import { IconButton, Item, Toggle, Typography } from '@/ui/components';
import { BIRTHDAY_CALENDAR_SLUG } from '@/services/nextcloud/caldav';
import type { CalendarMeta } from '@/types';

interface Props {
  calendar: CalendarMeta;
  visible: boolean;
  notifies: boolean;
  onToggleVisibility: () => void;
  onToggleNotifications: () => void;
}

function CalendarDrawerRowImpl({
  calendar, visible, notifies, onToggleVisibility, onToggleNotifications,
}: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const bellColor = !visible
    ? colors.textTertiary
    : notifies
      ? colors.primary
      : colors.textSecondary;

  const isBirthday = calendar.slug === BIRTHDAY_CALENDAR_SLUG;

  return (
    <Item
      leading={
        isBirthday ? (
          <Cake size={16} color={calendar.color} style={styles.cake} />
        ) : (
          <View style={[styles.dot, { backgroundColor: calendar.color }]} />
        )
      }
      title={
        <Typography variant="body1" numberOfLines={1} style={!visible && styles.muted}>
          {calendar.displayName}
        </Typography>
      }
      trailing={
        <View style={styles.controls}>
          <IconButton
            size={36}
            variant="plain"
            disabled={!visible}
            onPress={onToggleNotifications}
            accessibilityRole="switch"
            accessibilityState={{ checked: notifies, disabled: !visible }}
            accessibilityLabel={t('calendar.calendarNotifications', { name: calendar.displayName })}
          >
            {notifies && visible
              ? <Bell size={20} color={bellColor} />
              : <BellOff size={20} color={bellColor} />}
          </IconButton>
          <Toggle
            value={visible}
            onValueChange={onToggleVisibility}
            accessibilityLabel={t('calendar.calendarVisibility', { name: calendar.displayName })}
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  dot: { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  cake: { flexShrink: 0 },
  muted: { opacity: 0.5 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});

export const CalendarDrawerRow = React.memo(CalendarDrawerRowImpl);
