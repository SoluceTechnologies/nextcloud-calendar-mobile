import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from 'expo-router';
import { lightTheme } from '../../src/theme';
import SetupScreen from '../../app/(auth)/setup';
import { useSettingsStore } from '../../src/stores/settingsStore';
import i18n from '../../src/utils/i18n';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ThemeProvider, { value: lightTheme, children });
}

describe('SetupScreen i18n', () => {
  it('renders the English title by default', async () => {
    await i18n.changeLanguage('en');
    useSettingsStore.setState({ language: 'en' });
    const { getByText } = render(<SetupScreen />, { wrapper });
    expect(getByText('Connect to Nextcloud')).toBeTruthy();
  });

  it('renders the French title when language is fr', async () => {
    await i18n.changeLanguage('fr');
    useSettingsStore.setState({ language: 'fr' });
    const { getByText } = render(<SetupScreen />, { wrapper });
    expect(getByText('Se connecter à Nextcloud')).toBeTruthy();
  });
});
