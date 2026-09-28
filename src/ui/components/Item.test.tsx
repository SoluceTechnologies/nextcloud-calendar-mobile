import { render } from '@testing-library/react-native';
import Item from './Item';

describe('Item', () => {
  it('exposes testID when pressable', () => {
    const { getByTestId } = render(<Item testID="row" title="Accounts" onPress={() => {}} />);
    expect(getByTestId('row')).toBeTruthy();
  });

  it('exposes testID when static', () => {
    const { getByTestId } = render(<Item testID="row" title="Accounts" />);
    expect(getByTestId('row')).toBeTruthy();
  });
});
