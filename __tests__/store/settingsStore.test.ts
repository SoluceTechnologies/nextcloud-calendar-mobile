import { useSettingsStore } from '../../src/stores/settingsStore';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('settingsStore', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      themePreference: 'system',
      language: 'en',
      weekStartsOn: 0,
      defaultCalendarByAccount: {},
    });
  });

  it('defaults weekStartsOn to 0 (Sunday)', () => {
    expect(useSettingsStore.getState().weekStartsOn).toBe(0);
  });

  it('setWeekStartsOn(1) sets weekStartsOn to 1 (Monday)', () => {
    useSettingsStore.getState().setWeekStartsOn(1);
    expect(useSettingsStore.getState().weekStartsOn).toBe(1);
  });

  it('setWeekStartsOn(0) sets weekStartsOn back to 0 (Sunday)', () => {
    useSettingsStore.getState().setWeekStartsOn(1);
    useSettingsStore.getState().setWeekStartsOn(0);
    expect(useSettingsStore.getState().weekStartsOn).toBe(0);
  });

  it('setLanguage updates the language', () => {
    useSettingsStore.getState().setLanguage('de');
    expect(useSettingsStore.getState().language).toBe('de');
  });

  it('setThemePreference updates the theme', () => {
    useSettingsStore.getState().setThemePreference('dark');
    expect(useSettingsStore.getState().themePreference).toBe('dark');
  });
});

describe('default calendar per account', () => {
  beforeEach(() => {
    useSettingsStore.setState({ defaultCalendarByAccount: {} });
  });

  it('defaults to no per-account override', () => {
    expect(useSettingsStore.getState().defaultCalendarByAccount).toEqual({});
  });

  it('setDefaultCalendar stores the calendar for the given account only', () => {
    useSettingsStore.getState().setDefaultCalendar('acc-1', 'cal-url');
    useSettingsStore.getState().setDefaultCalendar('acc-2', 'other-url');
    expect(useSettingsStore.getState().defaultCalendarByAccount).toEqual({
      'acc-1': 'cal-url',
      'acc-2': 'other-url',
    });
  });

  it('setDefaultCalendar with undefined clears the override', () => {
    useSettingsStore.getState().setDefaultCalendar('acc-1', 'cal-url');
    useSettingsStore.getState().setDefaultCalendar('acc-1', undefined);
    expect(useSettingsStore.getState().defaultCalendarByAccount).toEqual({});
  });
});

describe('alert defaults', () => {
  it('defaults to no reminder lists', () => {
    expect(useSettingsStore.getState().timedAlerts).toEqual([]);
    expect(useSettingsStore.getState().allDayAlerts).toEqual([]);
  });

  it('setTimedAlerts stores several offsets', () => {
    useSettingsStore.getState().setTimedAlerts([60, 0]);
    expect(useSettingsStore.getState().timedAlerts).toEqual([60, 0]);
  });

  it('setAllDayAlerts stores several day offsets', () => {
    useSettingsStore.getState().setAllDayAlerts([1, 7]);
    expect(useSettingsStore.getState().allDayAlerts).toEqual([1, 7]);
  });

  it('migrates v1 scalar defaults into lists', () => {
    const options = useSettingsStore.persist.getOptions() as { migrate?: (s: unknown, v: number) => any };
    const migrated = options.migrate?.({ timedAlert: 15, allDayAlert: null }, 1);
    expect(migrated.timedAlerts).toEqual([15]);
    expect(migrated.allDayAlerts).toEqual([]);
    expect(migrated.timedAlert).toBeUndefined();
  });
});
