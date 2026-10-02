import React from 'react';
import { render as rtlRender } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ThemeWrapper } from '../helpers/theme';
import { HourRail } from '@/features/calendar/components/HourRail';
import { useSettingsStore } from '@/stores/settingsStore';

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: ThemeWrapper });

describe('HourRail', () => {
  it('renders one label per hour of the day', () => {
    useSettingsStore.setState({ timeFormat: '24h' });
    const { getByText, queryByText } = render(<HourRail />);
    expect(getByText('00:00')).toBeTruthy();
    expect(getByText('09:00')).toBeTruthy();
    expect(getByText('23:00')).toBeTruthy();
    expect(queryByText('24:00')).toBeNull();
  });

  it('renders 12-hour labels when the preference is 12h', () => {
    useSettingsStore.setState({ timeFormat: '12h' });
    const { getByText } = render(<HourRail />);
    expect(getByText('12 AM')).toBeTruthy();
    expect(getByText('9 AM')).toBeTruthy();
    expect(getByText('11 PM')).toBeTruthy();
  });

  it('renders 24 blocks', () => {
    const { getAllByTestId } = render(<HourRail />);
    expect(getAllByTestId(/^hour-block-/)).toHaveLength(24);
  });

  it('divides the rail equally rather than sizing blocks in pixels', () => {
    const flat = StyleSheet.flatten(render(<HourRail />).getByTestId('hour-block-9').props.style);
    expect(flat.flex).toBe(1);
    expect(flat.height).toBeUndefined();
  });
});
