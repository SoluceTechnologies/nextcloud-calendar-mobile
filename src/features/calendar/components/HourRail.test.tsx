import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { HourRail } from '@/features/calendar/components/HourRail';

describe('HourRail', () => {
  it('renders one label per hour of the day', () => {
    const { getByText, queryByText } = render(<HourRail />);
    expect(getByText('0:00')).toBeTruthy();
    expect(getByText('9:00')).toBeTruthy();
    expect(getByText('23:00')).toBeTruthy();
    expect(queryByText('24:00')).toBeNull();
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
