import { render } from '@testing-library/react-native';
import Chip from './Chip';

describe('Chip', () => {
  it('exposes testID and selected state', () => {
    const { getByTestId } = render(<Chip testID="c" active>Month</Chip>);
    expect(getByTestId('c').props.accessibilityState).toEqual({ selected: true, disabled: false });
  });
});
