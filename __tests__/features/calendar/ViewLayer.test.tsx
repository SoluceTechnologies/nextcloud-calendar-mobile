import { Text } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { ViewLayer } from '@/features/calendar/components/ViewLayer';

describe('ViewLayer', () => {
  it('keeps rendering the last visible children while hidden', () => {
    const screen = render(<ViewLayer visible><Text>first</Text></ViewLayer>);

    screen.rerender(<ViewLayer visible={false}><Text>second</Text></ViewLayer>);
    expect(screen.getByText('first')).toBeTruthy();
    expect(screen.queryByText('second')).toBeNull();
  });

  it('shows the latest children as soon as the layer becomes visible again', () => {
    const screen = render(<ViewLayer visible><Text>first</Text></ViewLayer>);
    screen.rerender(<ViewLayer visible={false}><Text>second</Text></ViewLayer>);

    screen.rerender(<ViewLayer visible><Text>third</Text></ViewLayer>);
    expect(screen.getByText('third')).toBeTruthy();
  });

  it('mounts a never-shown layer with its latest children once the UI is idle', async () => {
    const screen = render(<ViewLayer visible={false}><Text>first</Text></ViewLayer>);
    expect(screen.queryByText('first')).toBeNull();

    screen.rerender(<ViewLayer visible={false}><Text>second</Text></ViewLayer>);
    await waitFor(() => expect(screen.getByText('second')).toBeTruthy());
  });
});
