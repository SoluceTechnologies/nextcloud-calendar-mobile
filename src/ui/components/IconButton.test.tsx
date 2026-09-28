import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import IconButton from './IconButton';

describe('IconButton', () => {
  it('exposes testID', () => {
    const { getByTestId } = render(<IconButton testID="ib"><Text>x</Text></IconButton>);
    expect(getByTestId('ib')).toBeTruthy();
  });
});
