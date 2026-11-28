import { Text } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { ViewLayer } from '@/features/calendar/components/ViewLayer';

const mockFreezeStates: boolean[] = [];

jest.mock('react-freeze', () => ({
  Freeze: ({ freeze, children }: { freeze: boolean; children: React.ReactNode }) => {
    mockFreezeStates.push(freeze);
    return children;
  },
}));

beforeEach(() => {
  mockFreezeStates.length = 0;
});

describe('ViewLayer freezing', () => {
  it('does not freeze in the same commit that hides a visible layer', async () => {
    const screen = render(<ViewLayer visible><Text>layer</Text></ViewLayer>);
    expect(mockFreezeStates.at(-1)).toBe(false);

    const statesBeforeHide = mockFreezeStates.length;
    screen.rerender(<ViewLayer visible={false}><Text>layer</Text></ViewLayer>);
    expect(mockFreezeStates.slice(statesBeforeHide)).toContain(false);

    await waitFor(() => expect(mockFreezeStates.at(-1)).toBe(true));
  });

  it('unfreezes immediately when the layer becomes visible again', async () => {
    const screen = render(<ViewLayer visible={false}><Text>layer</Text></ViewLayer>);
    await waitFor(() => expect(mockFreezeStates.at(-1)).toBe(true));

    screen.rerender(<ViewLayer visible><Text>layer</Text></ViewLayer>);
    expect(mockFreezeStates.at(-1)).toBe(false);
  });
});
