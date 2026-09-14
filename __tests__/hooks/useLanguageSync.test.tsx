import { renderHook } from '@testing-library/react-native';
import { act } from 'react';
import { useLanguageSync } from '@/hooks/useLanguageSync';
import { useSettingsStore } from '../../src/stores/settingsStore';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockChangeLanguage = jest.fn();
const SUPPORTED = ['en', 'fr', 'de', 'es', 'ru', 'it'];
jest.mock('../../src/utils/i18n', () => ({
  __esModule: true,
  default: { changeLanguage: (l: string) => mockChangeLanguage(l) },
  isSupported: (c: string) => SUPPORTED.includes(c),
  getInitialLanguage: () => 'en',
  getInitialWeekStartsOn: () => 0,
  SUPPORTED,
  LANGUAGES: SUPPORTED.map((code) => ({ code, label: code, region: code.toUpperCase() })),
}));

const mockDayjsLocale = jest.fn();
jest.mock('dayjs', () => ({
  __esModule: true,
  default: { locale: (l: string) => mockDayjsLocale(l) },
}));

describe('useLanguageSync', () => {
  beforeEach(() => {
    mockChangeLanguage.mockClear();
    mockDayjsLocale.mockClear();
    useSettingsStore.setState({ language: 'en' });
  });

  it('syncs i18n and dayjs to the current store language on mount', () => {
    useSettingsStore.setState({ language: 'fr' });
    renderHook(() => useLanguageSync());
    expect(mockChangeLanguage).toHaveBeenCalledWith('fr');
    expect(mockDayjsLocale).toHaveBeenCalledWith('fr');
  });

  it('re-syncs when the store language changes', () => {
    renderHook(() => useLanguageSync());
    mockChangeLanguage.mockClear();
    mockDayjsLocale.mockClear();
    act(() => {
      useSettingsStore.getState().setLanguage('de');
    });
    expect(mockChangeLanguage).toHaveBeenCalledWith('de');
    expect(mockDayjsLocale).toHaveBeenCalledWith('de');
  });

  it('falls back to en when the stored language is unsupported', () => {
    useSettingsStore.setState({ language: 'pt' as never });
    renderHook(() => useLanguageSync());
    expect(mockChangeLanguage).toHaveBeenCalledWith('en');
    expect(mockDayjsLocale).toHaveBeenCalledWith('en');
  });
});
