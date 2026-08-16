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
      // Default: delegate to the (test-mocked) global fetch so existing
      // api tests that mock `fetch` keep working through trustedFetch.
      request: jest.fn(async ({ url, method, headers, bodyBase64 }) => {
        const body = bodyBase64
          ? Buffer.from(bodyBase64, 'base64').toString('utf8')
          : undefined;
        const res = await global.fetch(url, { method, headers, body });
        const text = await res.text();
        const h = {};
        res.headers.forEach((v, k) => { h[k] = v; });
        return {
          type: 'response',
          status: res.status,
          headers: h,
          bodyBase64: Buffer.from(text, 'utf8').toString('base64'),
        };
      }),
    },
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
