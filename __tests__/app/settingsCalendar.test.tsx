import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from 'expo-router';
import { lightTheme } from '../../src/theme';
import CalendarSettingsScreen from '../../app/(tabs)/settings/calendar';
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

describe('Calendar settings page', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    useSettingsStore.setState({ language: 'en', monthViewStyle: 'grid' });
  });

  it('switches the month view to compact', () => {
    const { getByText } = render(<CalendarSettingsScreen />, { wrapper });
    expect(getByText('Month view')).toBeTruthy();
    fireEvent.press(getByText('Compact'));
    expect(useSettingsStore.getState().monthViewStyle).toBe('compact');
  });
});
