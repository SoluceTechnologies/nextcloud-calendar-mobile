import * as Notifications from 'expo-notifications';
import { scheduleEventAlerts } from '@/features/notifications/scheduleAlerts';
import { readUpcomingEvents } from '@/features/widget/core/readEvents';
import { useSettingsStore } from '@/stores/settingsStore';
import { useCalendarStore } from '@/stores/calendarStore';
import type { CalendarEvent } from '@/types';

jest.mock('expo-localization', () => ({
  getCalendars: jest.fn(() => [{ uses24hourClock: false }]),
  getLocales: jest.fn(() => [{ languageTag: 'en-US', languageCode: 'en', regionCode: 'US' }]),
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  setNotificationCategoryAsync: jest.fn(() => Promise.resolve()),
  registerTaskAsync: jest.fn(() => Promise.resolve()),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  cancelAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve()),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('id')),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { HIGH: 4 },
}));

jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));

jest.mock('@/features/widget/core/readEvents', () => ({
  readUpcomingEvents: jest.fn(() => Promise.resolve([])),
}));

jest.mock('@/features/map/utils/mapLinks', () => ({
  openMaps: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/features/event/utils/openTalkRoom', () => ({
  openTalkRoom: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/services/voice/tts', () => ({
  speak: jest.fn(), stop: jest.fn(), pause: jest.fn(), resume: jest.fn(),
  isSpeaking: jest.fn(() => Promise.resolve(false)),
}));

const readEvents = readUpcomingEvents as jest.Mock;
const schedule = Notifications.scheduleNotificationAsync as jest.Mock;

function ev(over: Partial<CalendarEvent>): CalendarEvent {
  return {
    uid: 'u1', href: '/c/u1.ics', calendarId: 'cal1', accountId: 'a1',
    summary: 'Sync', dtstart: new Date(Date.now() + 3600_000), dtend: new Date(Date.now() + 7200_000),
    allDay: false, color: '#000', attendees: [], isRecurring: false, isTask: false, ...over,
  } as CalendarEvent;
}

describe('scheduleEventAlerts — talk call reminder', () => {
  const now = new Date('2026-06-01T08:00:00Z');

  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({ timedAlerts: [], allDayAlerts: [], talkCallReminder: true });
    useCalendarStore.setState({ notifDisabledCalendarIds: [] });
    readEvents.mockResolvedValue([]);
  });

  it('adds a 5-min reminder for a talk-linked event without other alerts', async () => {
    const start = new Date('2026-06-01T12:00:00Z');
    readEvents.mockResolvedValue([ev({ dtstart: start, dtend: new Date(start.getTime() + 1800_000), talkUrl: 'https://nc/call/abc' })]);
    await scheduleEventAlerts(now);
    expect(schedule).toHaveBeenCalledTimes(1);
    const arg = schedule.mock.calls[0][0];
    expect(new Date(arg.trigger.date).getTime()).toBe(start.getTime() - 5 * 60_000);
    expect(arg.content.categoryIdentifier).toBe('event-alert-talk');
    expect(arg.content.data.url).toContain('://event/u1');
    expect(arg.content.data.talkUrl).toBe('https://nc/call/abc');
  });

  it('skips the extra reminder when an alert already lands within ±2 min', async () => {
    const start = new Date('2026-06-01T12:00:00Z');
    useSettingsStore.setState({ timedAlerts: [5], allDayAlerts: [], talkCallReminder: true });
    readEvents.mockResolvedValue([ev({ dtstart: start, dtend: start, talkUrl: 'https://nc/call/abc' })]);
    await scheduleEventAlerts(now);
    expect(schedule).toHaveBeenCalledTimes(1); // only the -5min alarm
  });

  it('adds nothing when talkCallReminder is off', async () => {
    const start = new Date('2026-06-01T12:00:00Z');
    useSettingsStore.setState({ timedAlerts: [], allDayAlerts: [], talkCallReminder: false });
    readEvents.mockResolvedValue([ev({ dtstart: start, dtend: start, talkUrl: 'https://nc/call/abc' })]);
    await scheduleEventAlerts(now);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('does not remind for tasks or all-day events', async () => {
    const start = new Date('2026-06-01T12:00:00Z');
    readEvents.mockResolvedValue([
      ev({ uid: 'task1', isTask: true, dtstart: start, dtend: start, talkUrl: 'https://nc/call/t' }),
      ev({ uid: 'day1', allDay: true, dtstart: start, dtend: start, talkUrl: 'https://nc/call/d' }),
    ]);
    await scheduleEventAlerts(now);
    expect(schedule).not.toHaveBeenCalled();
  });
});
