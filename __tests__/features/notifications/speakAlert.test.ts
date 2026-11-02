import {
  ALERT_CATEGORY,
  ALERT_SPEAK_ACTION,
  handleAlertResponse,
  registerAlertSpeakCategory,
  speakAlertNotification,
  type AlertSpeakData,
} from '@/features/notifications/speakAlert';
import * as tts from '@/services/voice/tts';
import { useSettingsStore } from '@/stores/settingsStore';
import type { NotificationResponse } from 'expo-notifications';

jest.mock('expo-localization', () => ({
  getCalendars: jest.fn(() => [{ uses24hourClock: false }]),
  getLocales: jest.fn(() => [{ languageTag: 'en-US', languageCode: 'en', regionCode: 'US' }]),
}));

jest.mock('expo-notifications', () => ({
  setNotificationCategoryAsync: jest.fn(() => Promise.resolve()),
  registerTaskAsync: jest.fn(() => Promise.resolve()),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(null)),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
}));

jest.mock('@/features/widget/core/readEvents', () => ({
  readUpcomingEvents: jest.fn(() => Promise.resolve([])),
}));

jest.mock('@/services/voice/tts', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  isSpeaking: jest.fn(() => Promise.resolve(false)),
}));

const Notifications = jest.requireMock('expo-notifications') as {
  setNotificationCategoryAsync: jest.Mock;
};
const speakMock = tts.speak as jest.Mock;

const TRIGGER: AlertSpeakData = {
  uid: 'e1',
  summary: 'Dentist',
  dtstart: new Date(2026, 7, 10, 18).toISOString(),
  dtend: new Date(2026, 7, 10, 19).toISOString(),
  allDay: false,
  location: 'Cabinet Nord',
};

function responseWith(data: AlertSpeakData, action = ALERT_SPEAK_ACTION): NotificationResponse {
  return {
    actionIdentifier: action,
    notification: { request: { content: { data } } },
  } as unknown as NotificationResponse;
}

beforeEach(() => {
  jest.clearAllMocks();
  useSettingsStore.setState({ language: 'en', timeFormat: '12h' });
});

describe('speakAlert — category', () => {
  it('registers a speak action that stays in the shade', async () => {
    await registerAlertSpeakCategory();
    expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledWith(ALERT_CATEGORY, [
      expect.objectContaining({
        identifier: ALERT_SPEAK_ACTION,
        buttonTitle: 'Listen',
        options: { opensAppToForeground: false },
      }),
    ]);
  });
});

describe('speakAlert — response handling', () => {
  it('ignores non-speak actions', () => {
    expect(handleAlertResponse(responseWith(TRIGGER, 'other-action'))).toBe(false);
    expect(speakMock).not.toHaveBeenCalled();
  });

  it('speaks the reminder then the following events', async () => {
    const following = [
      {
        uid: 'e2',
        summary: 'Call',
        dtstart: new Date(2026, 7, 10, 20),
        dtend: new Date(2026, 7, 10, 20, 30),
        allDay: false,
      },
      // earlier event — not "following" the trigger
      {
        uid: 'e0',
        summary: 'Early',
        dtstart: new Date(2026, 7, 10, 8),
        dtend: new Date(2026, 7, 10, 9),
        allDay: false,
      },
    ];
    await speakAlertNotification(TRIGGER, async () => following);

    const texts = speakMock.mock.calls.map((c) => c[0] as string);
    expect(texts[0]).toContain('Reminder: Dentist');
    expect(texts[0]).toContain('Cabinet Nord');
    expect(texts).toContain('Then 1 event to follow.');
    expect(texts.some((t) => t.includes('Call'))).toBe(true);
    expect(texts.some((t) => t.includes('Early'))).toBe(false);
    expect(texts[texts.length - 1]).toBe("That's all.");
    expect(speakMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({ language: 'en-US' }),
    );
  });

  it('still speaks the reminder alone when following events are unavailable', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await speakAlertNotification(TRIGGER, async () => {
      throw new Error('db down');
    });
    expect(speakMock).toHaveBeenCalledTimes(1);
    expect(speakMock.mock.calls[0][0]).toContain('Reminder: Dentist');
    warn.mockRestore();
  });

  it('does nothing for a notification without trigger data', async () => {
    await speakAlertNotification({ uid: 'e1' });
    expect(speakMock).not.toHaveBeenCalled();
  });

  it('uses an English voice when the app language lacks briefing phrasing', async () => {
    useSettingsStore.setState({ language: 'de' });
    await speakAlertNotification(TRIGGER, async () => []);
    expect(speakMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({ language: 'en-US' }),
    );
  });
});
