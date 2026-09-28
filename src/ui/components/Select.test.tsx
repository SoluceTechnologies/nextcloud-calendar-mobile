import { fireEvent, render } from '@testing-library/react-native';
import Select from './Select';

describe('Select', () => {
  it('exposes testIDs on the trigger and on each option', () => {
    const options = [{ label: 'Never', value: null }, { label: 'Weekly', value: 'WEEKLY' }];
    const { getByTestId } = render(<Select testID="rec" value={null} options={options} onChange={() => {}} />);
    fireEvent.press(getByTestId('rec'));
    expect(getByTestId('rec-null')).toBeTruthy();
    expect(getByTestId('rec-WEEKLY')).toBeTruthy();
  });
});
