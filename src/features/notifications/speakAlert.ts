import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import i18n from '@/utils/i18n';

import { readUpcomingEvents } from '@/features/widget/core/readEvents';
import { stripUrls } from '@/features/widget/core/liveEvent';
import { useSettingsStore } from '@/stores/settingsStore';
import { getNativePickerLocale } from '@/utils/i18n';
import { resolveUse24h } from '@/utils/timeFormat';
import {
  buildReminderBriefing,
  briefingVoiceLocale,
  type BriefingEventInput,
} from '@/features/briefing/speechText';
import { openMaps } from '@/features/map/utils/mapLinks';
import { openTalkRoom } from '@/features/event/utils/openTalkRoom';
import { parseLocation } from '@/features/map/utils/parseLocation';
import * as tts from '@/services/voice/tts';

export const ALERT_CATEGORY = 'event-alert';
export const ALERT_NAV_CATEGORY = 'event-alert-nav';
export const ALERT_TALK_CATEGORY = 'event-alert-talk';
export const ALERT_TALK_NAV_CATEGORY = 'event-alert-talk-nav';
export const ALERT_SPEAK_ACTION = 'speak';
export const ALERT_NAVIGATE_ACTION = 'navigate';
export const ALERT_JOIN_ACTION = 'join-call';
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
  url?: string;
}

// "Écouter"/"Listen" button on reminder notifications — registered (again) on
// every reschedule so the label follows the app language. A second category adds
// "Itinéraire"/"Directions" for events with a physical location.
export async function registerAlertSpeakCategory(): Promise<void> {
  try {
    const speakAction = {
      identifier: ALERT_SPEAK_ACTION,
      buttonTitle: i18n.t('briefing.listenAction'),
      options: { opensAppToForeground: false },
    };
    const navAction = {
      identifier: ALERT_NAVIGATE_ACTION,
      buttonTitle: i18n.t('briefing.navigateAction'),
      options: { opensAppToForeground: true },
    };
    const joinAction = {
      identifier: ALERT_JOIN_ACTION,
      buttonTitle: i18n.t('notifications.joinCall'),
      options: { opensAppToForeground: true },
    };
    await Notifications.setNotificationCategoryAsync(ALERT_CATEGORY, [speakAction]);
    await Notifications.setNotificationCategoryAsync(ALERT_NAV_CATEGORY, [speakAction, navAction]);
    await Notifications.setNotificationCategoryAsync(ALERT_TALK_CATEGORY, [speakAction, joinAction]);
    await Notifications.setNotificationCategoryAsync(ALERT_TALK_NAV_CATEGORY, [
      speakAction,
      navAction,
      joinAction,
    ]);
  } catch (error) {
    if (__DEV__) console.warn('[alerts] speak category registration failed', error);
  }
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function triggerFromData(data: AlertSpeakData): BriefingEventInput | null {
  if (!data.uid || data.summary == null || !data.dtstart || !data.dtend) return null;
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
  readFollowing: (day: Date) => Promise<BriefingEventInput[]> = async (day) => {
    const events = await readUpcomingEvents(0, day);
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
    // Read the trigger's own day — advance reminders may fire days early.
    following = (await readFollowing(trigger.dtstart)).filter(
      (e) => e.dtstart.getTime() > trigger.dtstart.getTime() && sameLocalDay(e.dtstart, trigger.dtstart),
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

// Resolves a notification location to a maps destination: embedded geo:/maps
// coordinates win, otherwise the location text minus any conferencing URLs.
// Returns null for empty or URL-only locations (online meetings aren't places).
export function alertNavTarget(
  location?: string,
): { query: string; lat?: number; lon?: number } | null {
  const trimmed = location?.trim();
  if (!trimmed) return null;
  const coords = parseLocation(trimmed);
  const cleaned = stripUrls(trimmed).replace(/^geo:/i, '').replace(/\s+/g, ' ').trim();
  if (coords) {
    return { query: cleaned || `${coords.lat},${coords.lon}`, lat: coords.lat, lon: coords.lon };
  }
  return cleaned ? { query: cleaned } : null;
}

export function hasNavigableLocation(location?: string): boolean {
  return alertNavTarget(location) !== null;
}

export function navigateToAlertLocation(data: AlertSpeakData): void {
  const target = alertNavTarget(data.location);
  if (!target) return;
  void openMaps(target.query, target.lat, target.lon);
}

export function joinAlertCall(data: AlertSpeakData): void {
  if (!data.talkUrl) return;
  void openTalkRoom(data.talkUrl, useSettingsStore.getState().talkOpenMode);
}

export function handleAlertResponse(response: Notifications.NotificationResponse): boolean {
  const { actionIdentifier } = response;
  if (
    actionIdentifier !== ALERT_SPEAK_ACTION &&
    actionIdentifier !== ALERT_NAVIGATE_ACTION &&
    actionIdentifier !== ALERT_JOIN_ACTION
  ) {
    return false;
  }
  const data = (response.notification.request.content.data ?? {}) as AlertSpeakData;
  if (actionIdentifier === ALERT_NAVIGATE_ACTION) {
    navigateToAlertLocation(data);
  } else if (actionIdentifier === ALERT_JOIN_ACTION) {
    joinAlertCall(data);
  } else {
    void speakAlertNotification(data);
  }
  return true;
}

// Headless path (Android): defined at module scope so a cold-start background
// task can run it without any UI. iOS delivers the same response through the
// listener / last-notification-response instead.
TaskManager.defineTask<Notifications.NotificationTaskPayload>(SPEAK_ALERT_TASK, async ({ data }) => {
  if (data && typeof data === 'object' && 'actionIdentifier' in data) {
    const response = data as Notifications.NotificationResponse;
    const d = (response.notification.request.content.data ?? {}) as AlertSpeakData;
    if (response.actionIdentifier === ALERT_SPEAK_ACTION) {
      await speakAlertNotification(d);
    } else if (response.actionIdentifier === ALERT_NAVIGATE_ACTION) {
      navigateToAlertLocation(d);
    } else if (response.actionIdentifier === ALERT_JOIN_ACTION) {
      joinAlertCall(d);
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
