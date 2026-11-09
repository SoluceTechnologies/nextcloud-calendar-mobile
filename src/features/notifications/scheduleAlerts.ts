import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { readUpcomingEvents } from '@/features/widget/core/readEvents';
import { useSettingsStore } from '@/stores/settingsStore';
import { useCalendarStore } from '@/stores/calendarStore';
import i18n from '@/utils/i18n';

import { alertBody } from './alertContent';
import { alertTimes } from './alerts';
import { eventDeepLink } from '@/features/widget/core/types';
import {
  ALERT_CATEGORY,
  ALERT_NAV_CATEGORY,
  ALERT_TALK_CATEGORY,
  ALERT_TALK_NAV_CATEGORY,
  hasNavigableLocation,
  registerAlertSpeakCategory,
  registerAlertSpeakTask,
  type AlertSpeakData,
} from './speakAlert';

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

      const { timedAlerts, allDayAlerts, talkCallReminder } = useSettingsStore.getState();
      if (!(await hasAlertPermission())) return;

      await ensureChannel();
      await registerAlertSpeakCategory();
      await registerAlertSpeakTask();

      const notifDisabled = useCalendarStore.getState().notifDisabledCalendarIds;
      const events = (await readUpcomingEvents(HORIZON_DAYS, now))
        .filter((event) => !notifDisabled.includes(event.calendarId) && event.status !== 'cancelled');

      const due = events
        .flatMap((event) => alertTimes(event, timedAlerts, allDayAlerts).map((at) => ({ event, at })))
        .filter((x) => x.at.getTime() > now.getTime())
        .sort((a, b) => a.at.getTime() - b.at.getTime())
        .slice(0, MAX_SCHEDULED);

      // "Call starts in 5 min": one extra reminder for talk-linked events,
      // skipped when an existing alert already lands within ±2 minutes.
      const CALL_REMINDER_MS = 5 * 60_000;
      const DEDUPE_MS = 2 * 60_000;
      if (talkCallReminder) {
        const extras = events
          .filter((event) => event.talkUrl && !event.allDay && !event.isTask)
          .map((event) => ({ event, at: new Date(event.dtstart.getTime() - CALL_REMINDER_MS) }))
          .filter(
            (x) =>
              x.at.getTime() > now.getTime() &&
              !due.some(
                (d) => d.event.uid === x.event.uid && Math.abs(d.at.getTime() - x.at.getTime()) <= DEDUPE_MS,
              ),
          );
        due.push(...extras);
        due.sort((a, b) => a.at.getTime() - b.at.getTime());
        due.splice(MAX_SCHEDULED);
      }

      for (const { event, at } of due) {
        const speakData: AlertSpeakData & Record<string, unknown> = {
          uid: event.uid,
          summary: event.summary,
          dtstart: event.dtstart.toISOString(),
          dtend: event.dtend.toISOString(),
          allDay: event.allDay,
          location: event.location,
          talkUrl: event.talkUrl,
          isTask: event.isTask,
          url: eventDeepLink(event.uid),
        };
        await Notifications.scheduleNotificationAsync({
          content: {
            title: event.summary,
            body: alertBody(event, at),
            categoryIdentifier: event.talkUrl
              ? hasNavigableLocation(event.location)
                ? ALERT_TALK_NAV_CATEGORY
                : ALERT_TALK_CATEGORY
              : hasNavigableLocation(event.location)
                ? ALERT_NAV_CATEGORY
                : ALERT_CATEGORY,
            data: speakData,
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
