import React from 'react';
import { StyleSheet } from 'react-native';
import { render as rtlRender } from '@testing-library/react-native';

import type { SharedValue } from 'react-native-reanimated';
import { ThemeWrapper } from '../helpers/theme';
import { TimeGridView } from '@/features/calendar/components/TimeGridView';
import { toGridEvents } from '@/features/calendar/utils/toGridEvents';
import {
  ALL_DAY_PAD,
  ALL_DAY_ROW_HEIGHT,
  DAY_HEADER_HEIGHT,
  dayKey,
  pageFocusDate,
} from '@/features/calendar/utils/grid';
import type { CalendarEvent } from '@/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

let mockCapturedPagerProps: any[] = [];

jest.mock('react-native-infinite-pager', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef((props: any, _ref: any) => {
      mockCapturedPagerProps.push(props);
      return props.renderPage ? props.renderPage({ index: 0 }) : null;
    }),
  };
});

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: ThemeWrapper });

const anchor = new Date(2026, 7, 7);

const timed: CalendarEvent = {
  uid: 'e1', href: '/e1.ics', calendarId: 'c1', accountId: 'a1',
  summary: 'Standup',
  dtstart: new Date(2026, 7, 7, 9, 0), dtend: new Date(2026, 7, 7, 9, 30),
  allDay: false, color: '#0082c9', attendees: [], isRecurring: false,
};

const holiday: CalendarEvent = {
  ...timed,
  uid: 'e2', summary: 'Public holiday',
  dtstart: new Date(2026, 7, 7), dtend: new Date(2026, 7, 7), allDay: true,
};

function view(over: Partial<React.ComponentProps<typeof TimeGridView>> = {}) {
  const events = over.events ?? toGridEvents([timed]);
  return (
    <TimeGridView
      mode="week"
      anchorDate={anchor}
      activeDate={anchor}
      jump={{ nonce: 0, target: anchor }}
      events={events}
      allDayEvents={[]}
      hourRowHeight={60}
      cellHeight={{ value: 60 } as SharedValue<number>}
      weekStartsOn={1}
      commitZoom={jest.fn()}
      initialScrollHour={8}
      onPageChange={jest.fn()}
      onPressSlot={jest.fn()}
      onPressEvent={jest.fn()}
      onPressAllDayEvent={jest.fn()}
      {...over}
    />
  );
}

describe('TimeGridView', () => {
  beforeEach(() => {
    mockCapturedPagerProps = [];
  });

  it('renders the 24 hour labels exactly once, outside the pager', () => {
    const { getAllByText } = render(view());
    expect(getAllByText('9:00')).toHaveLength(1);
    expect(getAllByText('23:00')).toHaveLength(1);
  });

  it('renders seven day columns in week mode', () => {
    const { getAllByTestId } = render(view());
    expect(getAllByTestId('day-column-surface')).toHaveLength(7);
  });

  it('renders three day columns in 3days mode', () => {
    const { getAllByTestId } = render(view({ mode: '3days' }));
    expect(getAllByTestId('day-column-surface')).toHaveLength(3);
  });

  it('renders one day column in day mode', () => {
    const { getAllByTestId } = render(view({ mode: 'day' }));
    expect(getAllByTestId('day-column-surface')).toHaveLength(1);
  });

  it('places a timed event in the grid', () => {
    const { getByText } = render(view());
    expect(getByText('Standup')).toBeTruthy();
  });

  it('puts an all-day event in the header and not in the grid', () => {
    const { getByText } = render(
      view({
        events: toGridEvents([holiday]),
        allDayEvents: [holiday],
      })
    );
    expect(getByText('Public holiday')).toBeTruthy();
  });

  it('highlights today, and no day at all on a page without it', () => {
    const today = new Date();
    const todayKey = `day-highlight-${dayKey(today)}`;

    const onToday = render(view({ anchorDate: today, activeDate: today }));
    expect(onToday.getByTestId(todayKey)).toBeTruthy();

    const past = new Date(2020, 0, 8);
    const elsewhere = render(view({ anchorDate: past, activeDate: past }));
    expect(elsewhere.queryByTestId(todayKey)).toBeNull();
    expect(elsewhere.queryByTestId('day-highlight-2020-01-06')).toBeNull();
    expect(elsewhere.queryByTestId('day-highlight-2020-01-08')).toBeNull();
  });

  it('drops the stale page cache and shows the new dates after an anchorDate change', () => {
    const dayA = new Date(2026, 7, 7);
    const dayB = new Date(2026, 7, 21);
    const { getByText, queryByText, rerender } = render(
      view({ mode: 'day', anchorDate: dayA, activeDate: dayA })
    );
    expect(getByText('7')).toBeTruthy();

    rerender(view({ mode: 'day', anchorDate: dayB, activeDate: dayB }));

    expect(queryByText('7')).toBeNull();
    expect(getByText('21')).toBeTruthy();
  });

  it('sizes the header row for the visible page, not the anchor page', () => {
    const anchorDate = new Date(2026, 7, 7);
    const activeDate = new Date(2026, 7, 21);
    const allDay1: CalendarEvent = { ...holiday, uid: 'h1', dtstart: activeDate, dtend: activeDate };
    const allDay2: CalendarEvent = { ...holiday, uid: 'h2', dtstart: activeDate, dtend: activeDate };

    const { getByTestId } = render(
      view({ mode: 'week', weekStartsOn: 1, anchorDate, activeDate, allDayEvents: [allDay1, allDay2] })
    );

    const flat = StyleSheet.flatten(getByTestId('time-grid-header-row').props.style);
    expect(flat.height).toBe(DAY_HEADER_HEIGHT + 2 * ALL_DAY_ROW_HEIGHT + ALL_DAY_PAD);
  });

  it('wires the pager index through pageFocusDate to onPageChange', () => {
    const onPageChange = jest.fn();
    const anchorDate = new Date(2026, 7, 7);

    render(view({ mode: 'week', weekStartsOn: 1, anchorDate, activeDate: anchorDate, onPageChange }));

    const gridPagerProps = mockCapturedPagerProps.find((p) => typeof p.onPageChange === 'function');
    expect(gridPagerProps).toBeDefined();

    for (const index of [1, -1, 2, -2]) {
      gridPagerProps.onPageChange(index);
      expect(onPageChange).toHaveBeenLastCalledWith(pageFocusDate(anchorDate, index, 'week', 1));
    }
  });
});
