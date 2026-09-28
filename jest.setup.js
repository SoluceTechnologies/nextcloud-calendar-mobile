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

jest.mock('@testing-library/react-native', () => {
  const React = require('react');
  const { ThemeProvider } = require('expo-router');
  const { lightTheme } = require('@/theme');
  const actual = jest.requireActual('@testing-library/react-native');

  const withTheme = (Inner) =>
    function ThemedWrapper({ children }) {
      const content = Inner ? React.createElement(Inner, null, children) : children;
      return React.createElement(ThemeProvider, { value: lightTheme }, content);
    };

  const descriptors = Object.getOwnPropertyDescriptors(actual);
  delete descriptors.render;
  delete descriptors.renderHook;
  return Object.defineProperties(
    {
      render: (ui, opts = {}) => actual.render(ui, { ...opts, wrapper: withTheme(opts.wrapper) }),
      renderHook: (cb, opts = {}) => actual.renderHook(cb, { ...opts, wrapper: withTheme(opts.wrapper) }),
    },
    descriptors,
  );
});

jest.mock('react-native-mmkv', () => {
  class MMKV {
    constructor() {
      this.store = new Map();
    }
    getString(key) {
      return this.store.has(key) ? this.store.get(key) : undefined;
    }
    getBoolean(key) {
      const value = this.store.get(key);
      return typeof value === 'boolean' ? value : false;
    }
    getNumber(key) {
      const value = this.store.get(key);
      return typeof value === 'number' ? value : 0;
    }
    set(key, value) {
      this.store.set(key, value);
    }
    contains(key) {
      return this.store.has(key);
    }
    remove(key) {
      return this.store.delete(key);
    }
    clearAll() {
      this.store.clear();
    }
    getAllKeys() {
      return Array.from(this.store.keys());
    }
  }
  return { MMKV, createMMKV: () => new MMKV() };
});

jest.mock('expo-widgets', () => ({
  createWidget: () => ({
    updateSnapshot: jest.fn(),
    reload: jest.fn(),
  }),
  createLiveActivity: () => ({
    start: jest.fn(() => ({
      update: jest.fn().mockResolvedValue(undefined),
      end: jest.fn().mockResolvedValue(undefined),
      getPushToken: jest.fn().mockResolvedValue(null),
    })),
    getInstances: jest.fn(() => []),
  }),
  after: (date) => date,
}));
