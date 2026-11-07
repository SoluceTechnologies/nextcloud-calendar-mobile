import { useSettingsStore } from '../../src/stores/settingsStore';
import { storage, zustandStorage } from '../../src/storage';

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
      timeFormat: 'auto',
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

  it('defaults timeFormat to auto', () => {
    expect(useSettingsStore.getState().timeFormat).toBe('auto');
  });

  it('setTimeFormat updates the preference', () => {
    useSettingsStore.getState().setTimeFormat('12h');
    expect(useSettingsStore.getState().timeFormat).toBe('12h');
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

describe('voice assistant per account', () => {
  beforeEach(() => {
    useSettingsStore.setState({ voiceAssistantByAccount: {} });
    storage.remove('account_ids');
  });

  it('defaults to disabled for every account', () => {
    expect(useSettingsStore.getState().voiceAssistantByAccount).toEqual({});
  });

  it('setVoiceAssistantEnabled stores the flag for the given account only', () => {
    useSettingsStore.getState().setVoiceAssistantEnabled('acc-1', true);
    useSettingsStore.getState().setVoiceAssistantEnabled('acc-2', false);
    expect(useSettingsStore.getState().voiceAssistantByAccount).toEqual({
      'acc-1': true,
      'acc-2': false,
    });
  });

  it('migrates the legacy global flag onto every known account', () => {
    storage.set('account_ids', JSON.stringify(['acc-1', 'acc-2']));
    const options = useSettingsStore.persist.getOptions() as { migrate?: (s: unknown, v: number) => any };
    const migrated = options.migrate?.({ voiceAssistantEnabled: true }, 2);
    expect(migrated.voiceAssistantByAccount).toEqual({ 'acc-1': true, 'acc-2': true });
    expect(migrated.voiceAssistantEnabled).toBeUndefined();
  });

  it('legacy flag off migrates to an empty map', () => {
    storage.set('account_ids', JSON.stringify(['acc-1']));
    const options = useSettingsStore.persist.getOptions() as { migrate?: (s: unknown, v: number) => any };
    const migrated = options.migrate?.({ voiceAssistantEnabled: false }, 2);
    expect(migrated.voiceAssistantByAccount).toEqual({});
  });

  it('keeps existing per-account entries when the legacy flag is absent', () => {
    const options = useSettingsStore.persist.getOptions() as { migrate?: (s: unknown, v: number) => any };
    const migrated = options.migrate?.({ voiceAssistantByAccount: { 'acc-9': true } }, 3);
    expect(migrated.voiceAssistantByAccount).toEqual({ 'acc-9': true });
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

describe('month view style', () => {
  beforeEach(() => {
    zustandStorage.removeItem('settings-store');
  });

  it('defaults to the grid month view', () => {
    expect(useSettingsStore.getState().monthViewStyle).toBe('grid');
  });

  it('existing users without the key rehydrate to grid', async () => {
    useSettingsStore.setState({ monthViewStyle: 'grid' });
    zustandStorage.setItem('settings-store', JSON.stringify({ state: { weekStartsOn: 1 }, version: 2 }));
    await useSettingsStore.persist.rehydrate();
    expect(useSettingsStore.getState().monthViewStyle).toBe('grid');
    expect(useSettingsStore.getState().weekStartsOn).toBe(1);
  });

  it('persists the chosen style', () => {
    useSettingsStore.getState().setMonthViewStyle('compact');
    const stored = JSON.parse(zustandStorage.getItem('settings-store')!);
    expect(stored.state.monthViewStyle).toBe('compact');
  });
});
