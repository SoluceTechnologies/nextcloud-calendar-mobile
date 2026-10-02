import React from 'react';
import { render as rtlRender } from '@testing-library/react-native';
import { ThemeWrapper } from '../helpers/theme';
import { TimeGridPage } from '@/features/calendar/components/TimeGridPage';
import type { GridEvent } from '@/features/calendar/utils/toGridEvents';
import type { CalendarEvent } from '@/types';

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: ThemeWrapper });

const dates = [new Date(2026, 7, 7), new Date(2026, 7, 8)];

function gridEvent(uid: string, day: number): GridEvent {
  const e: CalendarEvent = {
    uid, href: `/${uid}.ics`, calendarId: 'c1', accountId: 'a1',
    summary: uid,
    dtstart: new Date(2026, 7, day, 9, 0), dtend: new Date(2026, 7, day, 10, 0),
    allDay: false, color: '#0082c9', attendees: [], isRecurring: false,
  };
  return { title: uid, start: e.dtstart, end: e.dtend, color: e.color, _event: e };
}

function page(over: Partial<React.ComponentProps<typeof TimeGridPage>> = {}) {
  const dayIndex = new Map([['2026-08-07', [gridEvent('a', 7)]]]);
  return (
    <TimeGridPage
      dates={dates}
      dayIndex={dayIndex}
      hourRowHeight={60}
      now={new Date(2026, 7, 7, 12, 0)}
      onPressSlot={jest.fn()}
      onPressEvent={jest.fn()}
      onMoveEvent={jest.fn()}
      {...over}
    />
  );
}

describe('TimeGridPage', () => {
  it('renders one column per date', () => {
    expect(render(page()).getAllByTestId('day-column-surface')).toHaveLength(2);
  });

  it('lays the day out and renders its events', () => {
    expect(render(page()).getByText('a')).toBeTruthy();
  });

  it('mounts no drag ghost until a drag begins', () => {
    expect(render(page()).queryByTestId('drag-ghost')).toBeNull();
  });
});
