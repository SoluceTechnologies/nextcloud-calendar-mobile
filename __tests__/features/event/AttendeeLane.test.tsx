import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { render as rtlRender, fireEvent } from '@testing-library/react-native';
import { ThemeWrapper } from '../../helpers/theme';

const render = (ui: ReactElement, opts?: Parameters<typeof rtlRender>[1]) =>
  rtlRender(ui, { wrapper: ThemeWrapper, ...opts });

import { AttendeeLane } from '@/features/event/components/AttendeeLane';

const baseProps = {
  blocks: [],
  pxPerMinute: 2,
  height: 40,
  range: { startMin: 360, endMin: 1320 },
  testID: 'lane-merged',
};

describe('AttendeeLane suggestion overlays', () => {
  it('renders one non-interactive overlay per suggestion', () => {
    const { getByTestId, queryByTestId } = render(
      <AttendeeLane
        {...baseProps}
        suggestions={[
          { startMin: 420, endMin: 480 },
          { startMin: 540, endMin: 600 },
          { startMin: 660, endMin: 720 },
        ]}
      />,
    );

    for (const i of [0, 1, 2]) {
      expect(getByTestId(`lane-merged-sugg-${i}`).props.pointerEvents).toBe('none');
    }
    expect(queryByTestId('lane-merged-sugg-3')).toBeNull();
  });

  it('positions overlays relative to the visible range', () => {
    const { getByTestId } = render(
      <AttendeeLane {...baseProps} suggestions={[{ startMin: 420, endMin: 480 }]} />,
    );

    const style = StyleSheet.flatten(getByTestId('lane-merged-sugg-0').props.style);
    expect(style.left).toBe(120); // (420 - 360) * 2
    expect(style.width).toBe(120); // (480 - 420) * 2
  });

  it('tints overlays with the success color', () => {
    const { getByTestId } = render(
      <AttendeeLane {...baseProps} suggestions={[{ startMin: 420, endMin: 480 }]} />,
    );

    const style = StyleSheet.flatten(getByTestId('lane-merged-sugg-0').props.style);
    expect(style.backgroundColor).toBe('#4caf5026');
    expect(style.borderColor).toBe('#4caf5099');
  });

  it('renders nothing when suggestions are absent', () => {
    const { queryByTestId } = render(<AttendeeLane {...baseProps} />);
    expect(queryByTestId('lane-merged-sugg-0')).toBeNull();
  });

  it('keeps taps flowing to the lane pressable', () => {
    const onTap = jest.fn();
    const { getByTestId } = render(
      <AttendeeLane
        {...baseProps}
        suggestions={[{ startMin: 420, endMin: 480 }]}
        onTap={onTap}
      />,
    );

    fireEvent.press(getByTestId('lane-merged'), { nativeEvent: { locationX: 42 } });
    expect(onTap).toHaveBeenCalledWith(42);
  });
});

describe('AttendeeLane selection', () => {
  it('uses the success border when the slot is free', () => {
    const { getByTestId } = render(
      <AttendeeLane
        {...baseProps}
        selection={{ startMin: 420, endMin: 480, free: true }}
      />,
    );

    const style = StyleSheet.flatten(getByTestId('lane-merged-selection').props.style);
    expect(style.borderColor).toBe('#4caf50');
  });

  it('uses the danger border when the slot conflicts', () => {
    const { getByTestId } = render(
      <AttendeeLane
        {...baseProps}
        selection={{ startMin: 420, endMin: 480, free: false }}
      />,
    );

    const style = StyleSheet.flatten(getByTestId('lane-merged-selection').props.style);
    expect(style.borderColor).toBe('#d32f2f');
  });
});
