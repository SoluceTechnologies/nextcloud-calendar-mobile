import React from 'react';
import { render as rtlRender, fireEvent } from '@testing-library/react-native';
import { ThemeWrapper } from '../helpers/theme';
import { CalendarFab } from '@/features/calendar/components/CalendarFab';

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: ThemeWrapper });

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

describe('CalendarFab', () => {
  it('exposes the calendar-fab-new testID and forwards presses', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(<CalendarFab onPress={onPress} />);
    fireEvent.press(getByTestId('calendar-fab-new'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
