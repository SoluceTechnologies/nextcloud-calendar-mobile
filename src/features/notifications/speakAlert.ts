import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import i18n from '@/utils/i18n';

import { readUpcomingEvents } from '@/features/widget/core/readEvents';
import { useSettingsStore } from '@/stores/settingsStore';
import { getNativePickerLocale } from '@/utils/i18n';
import { resolveUse24h } from '@/utils/timeFormat';
import {
  buildReminderBriefing,
  briefingVoiceLocale,
  type BriefingEventInput,
} from '@/features/briefing/speechText';
import * as tts from '@/services/voice/tts';

export const ALERT_CATEGORY = 'event-alert';
export const ALERT_SPEAK_ACTION = 'speak';
export const SPEAK_ALERT_TASK = 'alert-speak-task';

export interface AlertSpeakData {
  uid?: string;
  summary?: string;
  dtstart?: string;
  dtend?: string;
  allDay?: boolean;
  location?: string;
  talkUrl?: string;
  isTask?: boolean;
}

// "Écouter"/"Listen" button on reminder notifications — registered (again) on
// every reschedule so the label follows the app language.
export async function registerAlertSpeakCategory(): Promise<void> {
  try {
    await Notifications.setNotificationCategoryAsync(ALERT_CATEGORY, [
      {
        identifier: ALERT_SPEAK_ACTION,
        buttonTitle: i18n.t('briefing.listenAction'),
        options: { opensAppToForeground: false },
      },
    ]);
  } catch (error) {
    if (__DEV__) console.warn('[alerts] speak category registration failed', error);
  }
}

function triggerFromData(data: AlertSpeakData): BriefingEventInput | null {
  if (!data.uid || !data.summary || !data.dtstart || !data.dtend) return null;
  const dtstart = new Date(data.dtstart);
  const dtend = new Date(data.dtend);
  if (Number.isNaN(dtstart.getTime()) || Number.isNaN(dtend.getTime())) return null;
  return {
    uid: data.uid,
    summary: data.summary,
    dtstart,
    dtend,
    allDay: !!data.allDay,
    location: data.location,
    talkUrl: data.talkUrl,
    isTask: data.isTask,
  };
}

export async function speakAlertNotification(
  data: AlertSpeakData,
  readFollowing: () => Promise<BriefingEventInput[]> = async () => {
    const now = new Date();
    const events = await readUpcomingEvents(0, now);
    return events as BriefingEventInput[];
  },
): Promise<void> {
  const trigger = triggerFromData(data);
  if (!trigger) return;

  const language = useSettingsStore.getState().language;
  const locale = getNativePickerLocale(language);
  const use24h = resolveUse24h(useSettingsStore.getState().timeFormat, locale);
  const voice = briefingVoiceLocale(locale);

  let following: BriefingEventInput[] = [];
  try {
    following = (await readFollowing()).filter(
      (e) => e.dtstart.getTime() > trigger.dtstart.getTime(),
    );
  } catch (error) {
    if (__DEV__) console.warn('[alerts] following events unavailable, speaking reminder only', error);
  }

  const segs = buildReminderBriefing(trigger, following, { locale, use24h });
  // speak() calls are queued by the native engine — no UI state machine needed
  for (const seg of segs) {
    tts.speak(seg.text, { language: voice });
  }
}

export function handleAlertResponse(response: Notifications.NotificationResponse): boolean {
  if (response.actionIdentifier !== ALERT_SPEAK_ACTION) return false;
  const data = (response.notification.request.content.data ?? {}) as AlertSpeakData;
  void speakAlertNotification(data);
  return true;
}

// Headless path (Android): defined at module scope so a cold-start background
// task can run it without any UI. iOS delivers the same response through the
// listener / last-notification-response instead.
TaskManager.defineTask<Notifications.NotificationTaskPayload>(SPEAK_ALERT_TASK, async ({ data }) => {
  if (data && typeof data === 'object' && 'actionIdentifier' in data) {
    const response = data as Notifications.NotificationResponse;
    if (response.actionIdentifier === ALERT_SPEAK_ACTION) {
      const d = (response.notification.request.content.data ?? {}) as AlertSpeakData;
      await speakAlertNotification(d);
    }
  }
});

export async function registerAlertSpeakTask(): Promise<void> {
  try {
    await Notifications.registerTaskAsync(SPEAK_ALERT_TASK);
  } catch (error) {
    if (__DEV__) console.warn('[alerts] speak task registration failed', error);
  }
}
