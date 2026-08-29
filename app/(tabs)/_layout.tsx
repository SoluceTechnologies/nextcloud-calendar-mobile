import { Tabs, useTheme } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Calendar, Settings as SettingsIcon, Bell, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { SFSymbol } from 'sf-symbols-typescript';
import type { AndroidSymbol } from 'expo-symbols';
import { nativeTabsEnabled } from '@/utils/nativeTabs';
import { useNotificationStore } from '@/stores/notificationStore';

type IconState<T> = { default: T; selected: T };

type TabItem = {
  name: string;
  labelKey: string;
  sf: IconState<SFSymbol>;
  md: IconState<AndroidSymbol>;
  Icon: LucideIcon;
};

const TAB_ITEMS: TabItem[] = [
  {
    name: 'calendar/index',
    labelKey: 'tabs.calendar',
    sf: { default: 'calendar', selected: 'calendar' },
    md: { default: 'calendar_month', selected: 'calendar_month' },
    Icon: Calendar,
  },
  {
    name: 'notifications',
    labelKey: 'tabs.notifications',
    sf: { default: 'bell', selected: 'bell.fill' },
    md: { default: 'notifications', selected: 'notifications' },
    Icon: Bell,
  },
  {
    name: 'settings',
    labelKey: 'tabs.settings',
    sf: { default: 'gearshape', selected: 'gearshape.fill' },
    md: { default: 'settings', selected: 'settings' },
    Icon: SettingsIcon,
  },
];

function NativeTabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
      <NativeTabs labelStyle={{ color: theme.colors.text }} tintColor={theme.colors.primary}>
        {TAB_ITEMS.map((tab) => (
            <NativeTabs.Trigger key={tab.name} name={tab.name}>
              <NativeTabs.Trigger.Label>{t(tab.labelKey)}</NativeTabs.Trigger.Label>
              <NativeTabs.Trigger.Icon sf={tab.sf} md={tab.md} />
            </NativeTabs.Trigger>
        ))}
      </NativeTabs>
  );
}

function JsTabsLayout() {
  const theme = useTheme();
  const { t } = useTranslation();
  const calendarUnreadCount = useNotificationStore(
    (s) => s.notifications.filter((n) => n.app === 'calendar' || n.app === 'event_update_notification').filter((n) => !n.seen).length,
  );

  return (
      <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: theme.colors.primary,
            tabBarInactiveTintColor: theme.colors.tabBarInactive,
            tabBarStyle: {
              backgroundColor: theme.colors.tabBar,
              borderTopColor: theme.colors.tabBarBorder,
              borderTopWidth: 1,
              elevation: 0,
            },
            tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          }}
      >
        {TAB_ITEMS.map(({ name, labelKey, Icon }) => (
            <Tabs.Screen
                key={name}
                name={name}
                options={{
                  title: t(labelKey),
                  tabBarLabel: t(labelKey),
                  tabBarIcon: ({ color, focused }) => (
                      <Icon size={focused ? 26 : 24} color={color} strokeWidth={focused ? 2.5 : 2} />
                  ),
                  tabBarBadge: name === 'notifications' && calendarUnreadCount > 0 ? String(calendarUnreadCount) : undefined,
                }}
            />
        ))}
      </Tabs>
  );
}

export default function TabsLayout() {
  return nativeTabsEnabled() ? <NativeTabsLayout /> : <JsTabsLayout />;
}