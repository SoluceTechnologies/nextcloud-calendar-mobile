import React from 'react';
import { Text } from 'react-native';
import { render as rtlRender } from '@testing-library/react-native';
import { ThemeWrapper } from '../helpers/theme';
import IconButton from '@/ui/components/IconButton';

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: ThemeWrapper });

describe('IconButton', () => {
  it('exposes testID', () => {
    const { getByTestId } = render(<IconButton testID="ib"><Text>x</Text></IconButton>);
    expect(getByTestId('ib')).toBeTruthy();
  });
});
