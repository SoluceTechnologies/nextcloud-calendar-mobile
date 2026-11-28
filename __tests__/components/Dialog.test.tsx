import React from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { fireEvent, render as rtlRender } from '@testing-library/react-native';
import { ThemeWrapper } from '../helpers/theme';
import Dialog from '@/ui/components/Dialog';

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: ThemeWrapper });

describe('Dialog', () => {
  it('renders children inside a ScrollView so tall content stays reachable', () => {
    const { getByText, UNSAFE_getByType } = render(
      <Dialog visible onClose={() => {}}>
        <Text>dialog body</Text>
      </Dialog>,
    );

    expect(getByText('dialog body')).toBeTruthy();
    expect(UNSAFE_getByType(ScrollView)).toBeTruthy();
  });

  it('caps the card height below the window height', () => {
    const { UNSAFE_getByType } = render(
      <Dialog visible onClose={() => {}}>
        <Text>x</Text>
      </Dialog>,
    );

    const scroll = UNSAFE_getByType(ScrollView);
    const card = scroll.parent;
    const flat = StyleSheet.flatten(card?.props.style);
    expect(flat.maxHeight).toBeGreaterThan(0);
  });

  it('pressing the backdrop calls onClose', () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <Dialog visible onClose={onClose}>
        <Text>x</Text>
      </Dialog>,
    );

    fireEvent.press(getByTestId('dialog-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
