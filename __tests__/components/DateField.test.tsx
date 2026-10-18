import React from 'react';
import { render as rtlRender } from '@testing-library/react-native';
import { ThemeWrapper } from '../helpers/theme';
import DateField from '@/ui/components/DateField';

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: ThemeWrapper });

describe('DateField', () => {
  it('exposes testID on the field and on its error', () => {
    const { getByTestId } = render(<DateField testID="end" value="Fri" onPress={() => {}} error="bad" />);
    expect(getByTestId('end')).toBeTruthy();
    expect(getByTestId('end-error')).toBeTruthy();
  });
});
