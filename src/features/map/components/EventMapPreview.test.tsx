import { render, fireEvent } from '@testing-library/react-native';
import { EventMapPreview } from '@/features/map/components/EventMapPreview';

describe('EventMapPreview', () => {
  const coords = { lat: 48.8566, lon: 2.3522, displayName: 'Paris' };

  it('renders a map and calls onPress when the preview is tapped', () => {
    const onPress = jest.fn();
    const { getByTestId, getByLabelText } = render(
      <EventMapPreview
        location="Paris"
        coordinates={coords}
        onPress={onPress}
      />,
    );

    expect(getByTestId('web-view')).toBeTruthy();
    fireEvent.press(getByLabelText('Paris'));
    expect(onPress).toHaveBeenCalled();
  });
});
