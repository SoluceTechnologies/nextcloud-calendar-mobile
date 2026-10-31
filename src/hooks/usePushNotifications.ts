import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // Badge notifications: show in tray (for launcher badge) but no banner/sound
    if (notification.request.content.data?._badge) {
      return {
        shouldShowAlert: false,
        shouldShowBanner: false,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      } as Notifications.NotificationBehavior;
    }
    return {
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    } as Notifications.NotificationBehavior;
  },
});

export function usePushNotifications(): void {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    void (async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
          const { status: newStatus } = await Notifications.requestPermissionsAsync();
          if (newStatus !== 'granted') {
            console.log('[usePushNotifications] notification permission not granted');
          }
        }
      } catch (err) {
        console.warn('[usePushNotifications] permission error:', err);
      }
    })();
  }, []);
}
