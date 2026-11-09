import React, { type ReactElement } from 'react';
import { render as rtlRender } from '@testing-library/react-native';
import { ThemeWrapper } from '../../helpers/theme';
import { DaySummarySheet } from '@/features/ai/DaySummarySheet';
import { useSettingsStore } from '../../../src/stores/settingsStore';
import i18n from '../../../src/utils/i18n';

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: ThemeWrapper });

jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default
);
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve()) }));

const mockUseDaySummary = jest.fn();
const mockUseTaskTypes = jest.fn();
jest.mock('@/features/ai/useDaySummary', () => ({
  useDaySummary: (dayIso: string) => mockUseDaySummary(dayIso),
}));
jest.mock('@/features/ai/useTaskTypes', () => ({
  useTaskTypes: () => mockUseTaskTypes(),
}));

const idleSummary = {
  summary: '3 events · next: Standup at 09:30, Room 1',
  fromAi: false,
  state: 'idle' as const,
  regenerate: jest.fn(),
};
const noProvider = { taskTypes: null, loading: false, textTaskType: null, refresh: jest.fn() };
const withProvider = { ...noProvider, textTaskType: 'core:text2text' };

beforeEach(async () => {
  await i18n.changeLanguage('en');
  jest.clearAllMocks();
  useSettingsStore.setState({ aiEnabled: false });
  mockUseTaskTypes.mockReturnValue(noProvider);
  mockUseDaySummary.mockReturnValue(idleSummary);
});

describe('DaySummarySheet', () => {
  it('shows the template summary instantly and hides AI chrome when AI is off', () => {
    const { getByTestId, queryByTestId } = render(
      <DaySummarySheet visible onClose={() => {}} dayIso="2026-01-15" />
    );
    expect(getByTestId('day-summary-text').props.children).toBe(idleSummary.summary);
    expect(getByTestId('day-summary-copy')).toBeTruthy();
    expect(queryByTestId('day-summary-regenerate')).toBeNull();
    expect(queryByTestId('day-summary-disclosure')).toBeNull();
  });

  it('shows the thinking state and a regenerate button while the AI runs', () => {
    useSettingsStore.setState({ aiEnabled: true });
    mockUseTaskTypes.mockReturnValue(withProvider);
    mockUseDaySummary.mockReturnValue({ ...idleSummary, state: 'running' });
    const { getByTestId } = render(
      <DaySummarySheet visible onClose={() => {}} dayIso="2026-01-15" />
    );
    expect(getByTestId('day-summary-thinking')).toBeTruthy();
    expect(getByTestId('day-summary-regenerate')).toBeTruthy();
  });

  it('shows the disclosure once the summary comes from the AI', () => {
    useSettingsStore.setState({ aiEnabled: true });
    mockUseTaskTypes.mockReturnValue(withProvider);
    mockUseDaySummary.mockReturnValue({
      ...idleSummary,
      state: 'done',
      fromAi: true,
      summary: 'AI text',
    });
    const { getByTestId, getByText } = render(
      <DaySummarySheet visible onClose={() => {}} dayIso="2026-01-15" />
    );
    expect(getByTestId('day-summary-disclosure')).toBeTruthy();
    expect(getByText('AI text')).toBeTruthy();
  });

  it('does not mount the summary body while hidden', () => {
    render(<DaySummarySheet visible={false} onClose={() => {}} dayIso="2026-01-15" />);
    expect(mockUseDaySummary).not.toHaveBeenCalled();
  });
});
