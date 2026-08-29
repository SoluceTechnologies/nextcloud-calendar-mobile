import { useNotificationStore, withSeenFlag } from '@/stores/notificationStore';

describe('notificationStore', () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: [], unreadCount: 0, lastFetchedAt: null });
  });

  it('counts unread notifications', () => {
    useNotificationStore.getState().addOrUpdateNotifications([
      withSeenFlag({ notificationId: 1, app: 'calendar', subject: 'A' } as any),
      withSeenFlag({ notificationId: 2, app: 'calendar', subject: 'B' } as any),
    ]);
    expect(useNotificationStore.getState().unreadCount).toBe(2);
  });

  it('marks all as seen', () => {
    useNotificationStore.getState().addOrUpdateNotifications([
      withSeenFlag({ notificationId: 1, app: 'calendar', subject: 'A' } as any),
    ]);
    useNotificationStore.getState().markAllSeen();
    expect(useNotificationStore.getState().unreadCount).toBe(0);
    expect(useNotificationStore.getState().notifications[0].seen).toBe(true);
  });

  it('removes a notification and updates count', () => {
    useNotificationStore.getState().addOrUpdateNotifications([
      withSeenFlag({ notificationId: 1, app: 'calendar', subject: 'A' } as any),
      withSeenFlag({ notificationId: 2, app: 'calendar', subject: 'B' } as any),
    ]);
    useNotificationStore.getState().removeNotification(1);
    expect(useNotificationStore.getState().unreadCount).toBe(1);
  });
});
