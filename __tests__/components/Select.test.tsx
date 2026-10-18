import React from 'react';
import { fireEvent, render as rtlRender } from '@testing-library/react-native';
import { ThemeWrapper } from '../helpers/theme';
import Select from '@/ui/components/Select';

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: ThemeWrapper });

describe('Select', () => {
  it('exposes testIDs on the trigger and on each option', () => {
    const options = [{ label: 'Never', value: null }, { label: 'Weekly', value: 'WEEKLY' }];
    const { getByTestId } = render(<Select testID="rec" value={null} options={options} onChange={() => {}} />);
    fireEvent.press(getByTestId('rec'));
    expect(getByTestId('rec-null')).toBeTruthy();
    expect(getByTestId('rec-WEEKLY')).toBeTruthy();
  });
});
