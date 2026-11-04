import React from 'react';
import { render as rtlRender } from '@testing-library/react-native';
import { ThemeWrapper } from '../helpers/theme';
import Item from '@/ui/components/Item';

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: ThemeWrapper });

describe('Item', () => {
  it('exposes testID when pressable', () => {
    const { getByTestId } = render(<Item testID="row" title="Accounts" onPress={() => {}} />);
    expect(getByTestId('row')).toBeTruthy();
  });

  it('exposes testID when static', () => {
    const { getByTestId } = render(<Item testID="row" title="Accounts" />);
    expect(getByTestId('row')).toBeTruthy();
  });

  it('forwards accessibility actions', () => {
    const handler = jest.fn();
    const { getByTestId } = render(
      <Item
        testID="row"
        title="Row"
        onPress={jest.fn()}
        accessibilityActions={[{ name: 'delete', label: 'Remove' }]}
        onAccessibilityAction={handler}
      />,
    );
    const row = getByTestId('row');
    expect(row.props.accessibilityActions).toEqual([{ name: 'delete', label: 'Remove' }]);
    expect(row.props.accessibilityRole).toBe('button');
    row.props.onAccessibilityAction({ nativeEvent: { actionName: 'delete' } });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
