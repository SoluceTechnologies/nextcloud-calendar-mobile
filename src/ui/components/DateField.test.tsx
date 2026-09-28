import { render } from '@testing-library/react-native';
import DateField from './DateField';

describe('DateField', () => {
  it('exposes testID on the field and on its error', () => {
    const { getByTestId } = render(<DateField testID="end" value="Fri" onPress={() => {}} error="bad" />);
    expect(getByTestId('end')).toBeTruthy();
    expect(getByTestId('end-error')).toBeTruthy();
  });
});
