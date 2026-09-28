import { render } from '@testing-library/react-native';
import { CalendarTopBar } from './CalendarTopBar';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

describe('CalendarTopBar', () => {
  it('exposes drawer, today and one selectable chip per mode', () => {
    const { getByTestId } = render(
      <CalendarTopBar headerTitle="Sep" isToday={false} viewMode="month" onOpenDrawer={() => {}} onToday={() => {}} onSwitchMode={() => {}} />,
    );
    expect(getByTestId('calendar-drawer-open')).toBeTruthy();
    expect(getByTestId('calendar-today')).toBeTruthy();
    expect(getByTestId('calendar-mode-month').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('calendar-mode-week').props.accessibilityState.selected).toBe(false);
    for (const mode of ['3days', 'day', 'schedule']) expect(getByTestId(`calendar-mode-${mode}`)).toBeTruthy();
  });
});
