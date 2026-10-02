import React from 'react';
import { render as rtlRender } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ThemeWrapper } from '../helpers/theme';
import { DragGhost } from '@/features/calendar/components/DragGhost';
import type { GridEvent } from '@/features/calendar/utils/toGridEvents';
import type { CalendarEvent } from '@/types';

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: ThemeWrapper });

const shared = (v: number) => ({ value: v }) as never;

const event: GridEvent = (() => {
  const e: CalendarEvent = {
    uid: 'u1', href: '/u1.ics', calendarId: 'c1', accountId: 'a1',
    summary: 'Standup',
    dtstart: new Date(2026, 7, 7, 9, 0), dtend: new Date(2026, 7, 7, 10, 0),
    allDay: false, color: '#0082c9', attendees: [], isRecurring: false,
  };
  return { title: e.summary, start: e.dtstart, end: e.dtend, color: e.color, _event: e };
})();

function ghost(color?: string) {
  const eventWithColor: GridEvent = color ? { ...event, color } : event;
  return (
    <DragGhost
      event={eventWithColor}
      translateX={shared(0)}
      translateY={shared(100)}
      height={shared(60)}
      restingHeight={60}
      resizing={false}
      width={100}
    />
  );
}

describe('DragGhost', () => {
  it('shows the dragged event title', () => {
    expect(render(ghost()).getByText('Standup')).toBeTruthy();
  });

  it('renders no resize handles', () => {
    const { queryByTestId } = render(ghost());
    expect(queryByTestId('ghost-handle-start')).toBeNull();
    expect(queryByTestId('ghost-handle-end')).toBeNull();
  });

  it('draws no outline, so it reads as the event rather than a frame', () => {
    const flat = StyleSheet.flatten(render(ghost()).getByTestId('drag-ghost').props.style);
    expect(flat.borderWidth ?? 0).toBe(0);
  });

  it('carries the event colour', () => {
    const flat = StyleSheet.flatten(render(ghost()).getByTestId('drag-ghost').props.style);
    expect(flat.backgroundColor).toBe('#0082c9');
  });

  it('pins the title to the top, as the resting card draws it', () => {
    const flat = StyleSheet.flatten(render(ghost()).getByTestId('drag-ghost').props.style);
    expect(flat.justifyContent).toBe('flex-start');
  });

  it('picks title ink colour from the event background luminance', () => {
    const darkGhost = render(ghost('#0082c9'));
    const darkTitle = darkGhost.getByText('Standup');
    const darkTitleFlat = StyleSheet.flatten(darkTitle.props.style);

    const paleGhost = render(ghost('#ffe8a3'));
    const paleTitle = paleGhost.getByText('Standup');
    const paleTitleFlat = StyleSheet.flatten(paleTitle.props.style);

    expect(darkTitleFlat.color).not.toBe(paleTitleFlat.color);
    expect(paleTitleFlat.color).toBe('#1c1c1e');
    expect(darkTitleFlat.color).toBe('#ffffff');
  });
});
