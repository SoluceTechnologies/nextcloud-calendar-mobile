global.self = global;

global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;

jest.mock('expo-notifications', () => ({
  __esModule: true,
  setBadgeCountAsync: jest.fn(() => Promise.resolve(true)),
  getBadgeCountAsync: jest.fn(() => Promise.resolve(0)),
  getDevicePushTokenAsync: jest.fn(() => Promise.resolve({ data: 'test-token' })),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('notif-id')),
  cancelAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve()),
  dismissNotificationAsync: jest.fn(() => Promise.resolve()),
  AndroidImportance: { HIGH: 'high', LOW: 'low', MIN: 'min' },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  removeNotificationSubscription: jest.fn(),
}));

jest.mock('@/features/notifications/appBadge', () => ({
  __esModule: true,
  setAppBadge: jest.fn(() => Promise.resolve()),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('@nozbe/watermelondb/adapters/sqlite', () => ({
  __esModule: true,
  default: class SQLiteAdapterMock {
    constructor(options) {
      Object.assign(this, options);
    }
  },
}));

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn, ...args) => fn(...args),
}));

jest.mock('@/services/shared/nativeTlsTrust', () => {
  let pins = {};
  return {
    TlsTrust: {
      setPins: jest.fn((map) => { pins = map; }),
      __getPins: () => pins,
      request: jest.fn(async ({ url, method, headers, bodyBase64 }) => {
        const body = bodyBase64
          ? Buffer.from(bodyBase64, 'base64').toString('utf8')
          : undefined;
        const res = await global.fetch(url, { method, headers, body });
        let text = '';
        if (typeof res.text === 'function') text = await res.text();
        else if (typeof res.json === 'function') text = JSON.stringify(await res.json());
        const h = {};
        if (res.headers && typeof res.headers.forEach === 'function') {
          res.headers.forEach((v, k) => { h[k] = v; });
        }
        const status = res.status ?? (res.ok === false ? 400 : 200);
        return {
          type: 'response',
          status,
          headers: h,
          bodyBase64: Buffer.from(text ?? '', 'utf8').toString('base64'),
        };
      }),
    },
  };
});

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef(function WebView(props, ref) {
      React.useImperativeHandle(ref, () => ({
        postMessage: () => {},
        reload: () => {},
      }));
      React.useEffect(() => {
        if (props.onMessage) {
          props.onMessage({
            nativeEvent: { data: JSON.stringify({ type: 'ready' }) },
          });
        }
      }, [props.onMessage]);
      return React.createElement(View, { testID: 'web-view', ...props });
    }),
  };
});

jest.mock('react-native-reanimated', () => {
  const { View, ScrollView } = require('react-native');
  return {
    __esModule: true,
    default: { View, ScrollView, createAnimatedComponent: (c) => c },
    View,
    ScrollView,
    createAnimatedComponent: (c) => c,
    useSharedValue: (v) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useAnimatedRef: () => ({ current: null }),
    useAnimatedScrollHandler: (h) => h,
    scrollTo: () => {},
    useEvent: () => null,
    withTiming: (v) => v,
    withSpring: (v) => v,
    LinearTransition: {},
  };
});
