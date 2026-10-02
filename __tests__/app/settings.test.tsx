import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from 'expo-router';
import { lightTheme } from '../../src/theme';
import SettingsScreen from '../../app/(tabs)/settings/index';
import { useSettingsStore } from '../../src/stores/settingsStore';
import i18n from '../../src/utils/i18n';

const mockPush = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => ({ replace: jest.fn(), push: mockPush, back: jest.fn() }),
  useFocusEffect: () => {},
}));
jest.mock('expo-router/js-tabs', () => ({ useBottomTabBarHeight: () => 0 }));

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ThemeProvider, { value: lightTheme, children });
}

describe('SettingsScreen', () => {
  beforeEach(async () => {
    mockPush.mockClear();
    await i18n.changeLanguage('en');
    useSettingsStore.setState({ language: 'en' });
  });

  it('lists every settings section as a row', () => {
    const { getByText } = render(<SettingsScreen />, { wrapper });
    expect(getByText('Settings')).toBeTruthy();
    expect(getByText('Appearance')).toBeTruthy();
    expect(getByText('Calendar')).toBeTruthy();
    expect(getByText('Notifications')).toBeTruthy();
    expect(getByText('Accounts')).toBeTruthy();
    expect(getByText('About')).toBeTruthy();
  });

  it('keeps sub-page content off the index', () => {
    const { queryByText } = render(<SettingsScreen />, { wrapper });
    expect(queryByText('Theme')).toBeNull();
    expect(queryByText('Week Starts On')).toBeNull();
    expect(queryByText('Language')).toBeNull();
  });

  it.each([
    ['Appearance', '/(tabs)/settings/appearance'],
    ['Calendar', '/(tabs)/settings/calendar'],
    ['Notifications', '/(tabs)/settings/notifications'],
    ['About', '/(tabs)/settings/about'],
  ])('navigates to the %s page', (label, route) => {
    const { getByText } = render(<SettingsScreen />, { wrapper });
    fireEvent.press(getByText(label));
    expect(mockPush).toHaveBeenCalledWith(route);
  });
});
