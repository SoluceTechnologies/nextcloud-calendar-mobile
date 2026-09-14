import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import i18n from '@/utils/i18n';

/**
 * Android does not support `setBadgeCountAsync` for app-icon badges.
 * Instead, we post a silent, low-importance notification on a channel
 * with `showBadge: true`. The launcher reads the notification count
 * from that channel and displays a badge on the app icon automatically.
 *
 * On iOS, `setBadgeCountAsync` works natively and is used instead.
 */

const BADGE_CHANNEL_ID = 'app-badge';
const BADGE_NOTIFICATION_ID = 'app-badge-count';

let channelReady = false;

async function ensureBadgeChannel(): Promise<void> {
  if (Platform.OS !== 'android' || channelReady) return;
  await Notifications.setNotificationChannelAsync(BADGE_CHANNEL_ID, {
    name: i18n.t('settings.notifications.badgeChannelName', 'App badge'),
    importance: Notifications.AndroidImportance.LOW,
    showBadge: true,
    enableVibrate: false,
    enableLights: false,
  });
  channelReady = true;
}

export async function setAppBadge(count: number): Promise<void> {
  if (Platform.OS === 'web') return;

  // iOS: native badge
  if (Platform.OS === 'ios') {
    await Notifications.setBadgeCountAsync(count).catch(() => undefined);
    return;
  }

  // Android: post/dismiss a silent notification on a badge-enabled channel
  if (Platform.OS !== 'android') return;

  await ensureBadgeChannel();

  // Always dismiss the previous badge notification first
  await Notifications.dismissNotificationAsync(BADGE_NOTIFICATION_ID).catch(() => undefined);

  if (count <= 0) return;

  // Post a new silent notification with the unread count.
  // The channel has showBadge:true so the launcher shows a dot/number
  // on the app icon automatically.
  await Notifications.scheduleNotificationAsync({
    identifier: BADGE_NOTIFICATION_ID,
    content: {
      title: i18n.t('notifications.badgeTitle', {
        count,
        defaultValue: '{{count}} unread notification',
      }),
      body: '',
      data: { _badge: true },
      badge: count,
      sticky: true,
      priority: 'min',
      sound: false,
    },
    trigger: { channelId: BADGE_CHANNEL_ID },
  }).catch(() => undefined);
}
