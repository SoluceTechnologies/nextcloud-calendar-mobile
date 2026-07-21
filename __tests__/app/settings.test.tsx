import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from 'expo-router';
import { lightTheme } from '../../src/theme';
import SettingsScreen from '../../app/(tabs)/settings/index';
import { useSettingsStore } from '../../src/stores/settingsStore';
import i18n from '../../src/utils/i18n';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useRouter: () => ({ replace: jest.fn(), push: jest.fn() }), useFocusEffect: () => {} }));
jest.mock('expo-router/js-tabs', () => ({ useBottomTabBarHeight: () => 0 }));

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ThemeProvider, { value: lightTheme, children });
}

describe('SettingsScreen i18n', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    useSettingsStore.setState({ language: 'en' });
  });

  it('renders the title and the collapsible section headers', () => {
    const { getByText, queryByText } = render(<SettingsScreen />, { wrapper });
    expect(getByText('Settings')).toBeTruthy();
    expect(getByText('Appearance')).toBeTruthy();
    expect(getByText('Accounts')).toBeTruthy();
    expect(queryByText('Language')).toBeNull();
  });

  it('expands Appearance, opens the dropdown and lists all four languages', () => {
    const { getByText, queryByText } = render(<SettingsScreen />, { wrapper });
    expect(queryByText('Deutsch')).toBeNull();
    fireEvent.press(getByText('Appearance'));
    fireEvent.press(getByText('English'));
    expect(getByText('Deutsch')).toBeTruthy();
    expect(getByText('Français')).toBeTruthy();
    expect(getByText('Español')).toBeTruthy();
  });

  it('selecting a language from the dropdown updates the store', () => {
    const { getByText } = render(<SettingsScreen />, { wrapper });
    fireEvent.press(getByText('Appearance'));
    fireEvent.press(getByText('English'));
    fireEvent.press(getByText('Deutsch'));
    expect(useSettingsStore.getState().language).toBe('de');
  });
});
