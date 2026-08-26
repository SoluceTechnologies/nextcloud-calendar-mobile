import type { ReactElement } from 'react';
import { render as rtlRender, fireEvent } from '@testing-library/react-native';
import { ThemeWrapper } from '../../helpers/theme';
import { EventMapPreview } from '@/features/map/components/EventMapPreview';

const render = (ui: ReactElement, opts?: Parameters<typeof rtlRender>[1]) =>
  rtlRender(ui, { wrapper: ThemeWrapper, ...opts });

describe('EventMapPreview', () => {
  const coords = { lat: 48.8566, lon: 2.3522, displayName: 'Paris' };

  it('renders a WebView and calls onPress when tapped', () => {
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
