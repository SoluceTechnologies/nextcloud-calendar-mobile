import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from 'expo-router';
import { lightTheme } from '../../src/theme';
import AppearanceSettingsScreen from '../../app/(tabs)/settings/appearance';
import { useSettingsStore } from '../../src/stores/settingsStore';
import i18n from '../../src/utils/i18n';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
  useFocusEffect: () => {},
}));
jest.mock('expo-router/js-tabs', () => ({ useBottomTabBarHeight: () => 0 }));

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ThemeProvider, { value: lightTheme, children });
}

describe('Appearance settings page', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    useSettingsStore.setState({ language: 'en' });
  });

  it('shows the theme and language controls', () => {
    const { getByText } = render(<AppearanceSettingsScreen />, { wrapper });
    expect(getByText('Appearance')).toBeTruthy();
    expect(getByText('Theme')).toBeTruthy();
    expect(getByText('Language')).toBeTruthy();
  });

  it('opens the language dropdown and lists the other languages', () => {
    const { getByText, queryByText } = render(<AppearanceSettingsScreen />, { wrapper });
    expect(queryByText('Deutsch')).toBeNull();
    fireEvent.press(getByText('English'));
    expect(getByText('Deutsch')).toBeTruthy();
    expect(getByText('Français')).toBeTruthy();
    expect(getByText('Español')).toBeTruthy();
  });

  it('writes the picked language to the store', () => {
    const { getByText } = render(<AppearanceSettingsScreen />, { wrapper });
    fireEvent.press(getByText('English'));
    fireEvent.press(getByText('Deutsch'));
    expect(useSettingsStore.getState().language).toBe('de');
  });
});
