import React from 'react';
import { render as rtlRender } from '@testing-library/react-native';
import { ThemeWrapper } from '../helpers/theme';
import Chip from '@/ui/components/Chip';

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: ThemeWrapper });

describe('Chip', () => {
  it('exposes testID and selected state', () => {
    const { getByTestId } = render(<Chip testID="c" active>Month</Chip>);
    expect(getByTestId('c').props.accessibilityState).toEqual({ selected: true, disabled: false });
  });
});
