import type { ReactElement } from 'react';
import { render as rtlRender, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeWrapper } from '../../helpers/theme';
import { EventMapSheet } from '@/features/map/components/EventMapSheet';
import i18n from '@/utils/i18n';

const initialMetrics = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 0, height: 0 },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeWrapper>
      <SafeAreaProvider initialMetrics={initialMetrics}>{children}</SafeAreaProvider>
    </ThemeWrapper>
  );
}

const render = (ui: ReactElement, opts?: Parameters<typeof rtlRender>[1]) =>
  rtlRender(ui, { wrapper: Wrapper, ...opts });

describe('EventMapSheet', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  const coords = { lat: 48.8566, lon: 2.3522, displayName: 'Paris' };

  it('renders the map and calls onClose when pressing close', () => {
    const onClose = jest.fn();
    const { getByTestId, getByLabelText } = render(
      <EventMapSheet
        visible
        onClose={onClose}
        location="Paris"
        coordinates={coords}
      />,
    );

    expect(getByTestId('web-view')).toBeTruthy();
    fireEvent.press(getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});
