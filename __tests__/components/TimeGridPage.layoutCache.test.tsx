import React from 'react';
import { render as rtlRender } from '@testing-library/react-native';
import { ThemeWrapper } from '../helpers/theme';
import { TimeGridPage } from '@/features/calendar/components/TimeGridPage';
import type { GridEvent } from '@/features/calendar/utils/toGridEvents';
import type { CalendarEvent } from '@/types';

let mockCapturedPositioned: unknown[] = [];

jest.mock('@/features/calendar/components/DayColumn', () => ({
  DayColumn: (props: { positioned: unknown }) => {
    mockCapturedPositioned.push(props.positioned);
    return null;
  },
}));

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: ThemeWrapper });

function gridEvent(uid: string): GridEvent {
  const e: CalendarEvent = {
    uid, href: `/${uid}.ics`, calendarId: 'c1', accountId: 'a1', summary: uid,
    dtstart: new Date(2026, 7, 7, 9, 0), dtend: new Date(2026, 7, 7, 10, 0),
    allDay: false, color: '#0082c9', attendees: [], isRecurring: false,
  };
  return { title: e.summary, start: e.dtstart, end: e.dtend, color: e.color, _event: e };
}

const dates = [new Date(2026, 7, 7)];
const now = new Date(2026, 7, 7, 12, 0);

describe('TimeGridPage', () => {
  beforeEach(() => {
    mockCapturedPositioned = [];
  });

  it('reuses the positioned array for a day whose slices array is unchanged, even across distinct dayIndex Map instances', () => {
    const slices = [gridEvent('a')];

    const { rerender } = render(
      <TimeGridPage
        dates={dates}
        dayIndex={new Map([['2026-08-07', slices]])}
        hourRowHeight={60}
        now={now}
        onPressSlot={jest.fn()}
        onPressEvent={jest.fn()}
      />
    );
    const first = mockCapturedPositioned[0];

    rerender(
      <TimeGridPage
        dates={dates}
        dayIndex={new Map([['2026-08-07', slices]])}
        hourRowHeight={60}
        now={now}
        onPressSlot={jest.fn()}
        onPressEvent={jest.fn()}
      />
    );
    const second = mockCapturedPositioned[1];

    expect(second).toBe(first);
  });

  it('recomputes the layout when a day actually gains a new slices array', () => {
    const { rerender } = render(
      <TimeGridPage
        dates={dates}
        dayIndex={new Map([['2026-08-07', [gridEvent('a')]]])}
        hourRowHeight={60}
        now={now}
        onPressSlot={jest.fn()}
        onPressEvent={jest.fn()}
      />
    );
    const first = mockCapturedPositioned[0];

    rerender(
      <TimeGridPage
        dates={dates}
        dayIndex={new Map([['2026-08-07', [gridEvent('a'), gridEvent('b')]]])}
        hourRowHeight={60}
        now={now}
        onPressSlot={jest.fn()}
        onPressEvent={jest.fn()}
      />
    );
    const second = mockCapturedPositioned[1];

    expect(second).not.toBe(first);
  });
});
