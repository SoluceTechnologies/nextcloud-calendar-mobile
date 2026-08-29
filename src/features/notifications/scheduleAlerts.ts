import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { readUpcomingEvents } from '@/features/widget/core/readEvents';
import { useSettingsStore } from '@/stores/settingsStore';
import { useCalendarStore } from '@/stores/calendarStore';
import i18n from '@/utils/i18n';

import { alertBody } from './alertContent';
import { alertTime } from './alerts';

const CHANNEL_ID = 'event-alerts';
const HORIZON_DAYS = 30;


const MAX_SCHEDULED = 60;

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // Badge notifications: show in tray (for launcher badge) but no banner/sound
    if (notification.request.content.data?._badge) {
      return {
        shouldShowBanner: false,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    }
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  },
});

let running: Promise<void> | null = null;

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: i18n.t('settings.notifications.channelName'),
    importance: Notifications.AndroidImportance.HIGH,
  });
}

export async function hasAlertPermission(): Promise<boolean> {
  const { granted } = await Notifications.getPermissionsAsync();
  return granted;
}

export async function requestAlertPermission(): Promise<boolean> {
  const { granted } = await Notifications.requestPermissionsAsync();
  return granted;
}

export async function scheduleEventAlerts(now: Date = new Date()): Promise<void> {
  if (running) return running;
  running = (async () => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();

      const { timedAlert, allDayAlert } = useSettingsStore.getState();
      if (!(await hasAlertPermission())) return;

      await ensureChannel();

      const notifDisabled = useCalendarStore.getState().notifDisabledCalendarIds;
      const events = (await readUpcomingEvents(HORIZON_DAYS, now))
        .filter((event) => !notifDisabled.includes(event.calendarId));

      const due = events
        .map((event) => ({ event, at: alertTime(event, timedAlert, allDayAlert) }))
        .filter((x): x is { event: (typeof events)[number]; at: Date } => x.at !== null)
        .filter((x) => x.at.getTime() > now.getTime())
        .sort((a, b) => a.at.getTime() - b.at.getTime())
        .slice(0, MAX_SCHEDULED);

      for (const { event, at } of due) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: event.summary,
            body: alertBody(event, at),
            data: { uid: event.uid },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: at,
            channelId: CHANNEL_ID,
          },
        });
      }
    } catch (error) {
      if (__DEV__) console.warn('[alerts] scheduling failed', error);
    } finally {
      running = null;
    }
  })();
  return running;
}
