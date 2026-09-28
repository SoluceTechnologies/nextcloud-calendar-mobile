import { render, fireEvent } from '@testing-library/react-native';

import { LanguageSheet } from '@/components/LanguageSheet';
import { useSettingsStore } from '@/stores/settingsStore';
import i18n from '@/utils/i18n';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('LanguageSheet', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    useSettingsStore.setState({ language: 'en' });
  });

  it('shows the active language label on the trigger row', () => {
    const { getByText } = render(<LanguageSheet />);
    expect(getByText('English')).toBeTruthy();
  });

  it('opens the modal and lists all languages', () => {
    const { getByText, queryByText } = render(<LanguageSheet />);
    expect(queryByText('Deutsch')).toBeNull();
    fireEvent.press(getByText('English'));
    expect(getByText('Deutsch')).toBeTruthy();
    expect(getByText('Français')).toBeTruthy();
    expect(getByText('Español')).toBeTruthy();
  });

  it('selecting a language updates the store', () => {
    const { getByText } = render(<LanguageSheet />);
    fireEvent.press(getByText('English'));
    fireEvent.press(getByText('Français'));
    expect(useSettingsStore.getState().language).toBe('fr');
  });
});
