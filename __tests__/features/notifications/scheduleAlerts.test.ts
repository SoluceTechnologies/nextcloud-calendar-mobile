import * as Notifications from 'expo-notifications';

import { readUpcomingEvents } from '@/features/widget/core/readEvents';
import { scheduleEventAlerts } from '@/features/notifications/scheduleAlerts';
import { useCalendarStore } from '@/stores/calendarStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { CalendarEvent } from '@/types';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => 'notification-id'),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

jest.mock('@/features/widget/core/readEvents', () => ({
  readUpcomingEvents: jest.fn(),
}));

const readUpcomingEventsMock = readUpcomingEvents as jest.MockedFunction<typeof readUpcomingEvents>;
const cancelMock = Notifications.cancelAllScheduledNotificationsAsync as jest.Mock;
const scheduleMock = Notifications.scheduleNotificationAsync as jest.Mock;

function timedEvent(location: string): CalendarEvent {
  const start = new Date(2026, 7, 10, 10, 0);
  return {
    uid: 'event-1',
    href: 'https://example.test/event-1.ics',
    calendarId: 'calendar',
    accountId: 'account',
    summary: 'Dentist',
    dtstart: start,
    dtend: new Date(2026, 7, 10, 10, 30),
    allDay: false,
    color: '#0082c9',
    location,
    attendees: [],
    isRecurring: false,
  };
}

describe('scheduleEventAlerts dirty checking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({ timedAlerts: [15], allDayAlerts: [] });
    useCalendarStore.setState({ notifDisabledCalendarIds: [] });
  });

  it('skips identical rewrites but reschedules when the notification body changes', async () => {
    const now = new Date(2026, 7, 10, 9, 0);
    readUpcomingEventsMock.mockResolvedValue([timedEvent('Room A')]);

    await scheduleEventAlerts(now);
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(scheduleMock).toHaveBeenCalledTimes(1);

    await scheduleEventAlerts(now);
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(scheduleMock).toHaveBeenCalledTimes(1);

    readUpcomingEventsMock.mockResolvedValue([timedEvent('Room B')]);
    await scheduleEventAlerts(now);

    expect(cancelMock).toHaveBeenCalledTimes(2);
    expect(scheduleMock).toHaveBeenCalledTimes(2);
    expect(scheduleMock.mock.calls[1][0].content.body).toContain('Room B');
  });
});
