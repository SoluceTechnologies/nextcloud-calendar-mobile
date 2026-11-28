import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { readUpcomingEvents } from '@/features/widget/core/readEvents';
import { useSettingsStore } from '@/stores/settingsStore';
import { useCalendarStore } from '@/stores/calendarStore';
import i18n from '@/utils/i18n';

import { alertBody } from './alertContent';
import { alertTimes } from './alerts';

const CHANNEL_ID = 'event-alerts';
const HORIZON_DAYS = 30;


const MAX_SCHEDULED = 60;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let running: Promise<void> | null = null;
let queued = false;
let lastFingerprint: string | null = null;

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
  if (running) {
    queued = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        queued = false;
        await scheduleOnce(now);
        now = new Date();
      } while (queued);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function scheduleOnce(now: Date): Promise<void> {
  try {
    const granted = await hasAlertPermission();

    const notifDisabled = useCalendarStore.getState().notifDisabledCalendarIds;
    const events = granted
      ? (await readUpcomingEvents(HORIZON_DAYS, now)).filter(
          (event) => !notifDisabled.includes(event.calendarId) && event.status !== 'cancelled',
        )
      : [];

    const { timedAlerts, allDayAlerts } = useSettingsStore.getState();
    const due = events
      .flatMap((event) => alertTimes(event, timedAlerts, allDayAlerts).map((at) => ({ event, at })))
      .filter((x) => x.at.getTime() > now.getTime())
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .slice(0, MAX_SCHEDULED);

    const fingerprint = JSON.stringify(
      due.map(({ event, at }) => [event.uid, at.getTime(), event.summary, alertBody(event, at)]),
    );
    if (fingerprint === lastFingerprint) return;

    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!granted) {
      lastFingerprint = fingerprint;
      return;
    }

    await ensureChannel();

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
    lastFingerprint = fingerprint;
  } catch (error) {
    if (__DEV__) console.warn('[alerts] scheduling failed', error);
  }
}
