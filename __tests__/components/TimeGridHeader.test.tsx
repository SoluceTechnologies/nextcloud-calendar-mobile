import React from 'react';
import { render as rtlRender, fireEvent } from '@testing-library/react-native';
import { ThemeWrapper } from '../helpers/theme';
import { TimeGridHeader } from '@/features/calendar/components/TimeGridHeader';
import type { CalendarEvent } from '@/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: ThemeWrapper });

const dates = [new Date(2026, 7, 3), new Date(2026, 7, 4), new Date(2026, 7, 5)];

const holiday: CalendarEvent = {
  uid: 'h1', href: '/h1.ics', calendarId: 'c1', accountId: 'a1',
  summary: 'Public holiday',
  dtstart: new Date(2026, 7, 4), dtend: new Date(2026, 7, 4),
  allDay: true, color: '#0082c9', attendees: [], isRecurring: false,
};

describe('TimeGridHeader', () => {
  it('renders one day number per date', () => {
    const { getByText } = render(
      <TimeGridHeader dates={dates} now={dates[0]} allDayEvents={[]} onPressEvent={jest.fn()} />
    );
    expect(getByText('3')).toBeTruthy();
    expect(getByText('4')).toBeTruthy();
    expect(getByText('5')).toBeTruthy();
  });

  it('renders an all-day event on the day it covers', () => {
    const { getByText } = render(
      <TimeGridHeader dates={dates} now={dates[0]} allDayEvents={[holiday]} onPressEvent={jest.fn()} />
    );
    expect(getByText('Public holiday')).toBeTruthy();
  });

  it('reports the pressed all-day event', () => {
    const onPressEvent = jest.fn();
    const { getByText } = render(
      <TimeGridHeader dates={dates} now={dates[0]} allDayEvents={[holiday]} onPressEvent={onPressEvent} />
    );

    fireEvent.press(getByText('Public holiday'));

    expect(onPressEvent).toHaveBeenCalledWith(holiday);
  });

  it('highlights today and nothing else', () => {
    const { getByTestId, queryByTestId } = render(
      <TimeGridHeader dates={dates} now={dates[1]} allDayEvents={[]} onPressEvent={jest.fn()} />
    );
    expect(getByTestId('day-highlight-2026-08-04')).toBeTruthy();
    expect(queryByTestId('day-highlight-2026-08-03')).toBeNull();
    expect(queryByTestId('day-highlight-2026-08-05')).toBeNull();
  });

  it('highlights nothing on a page that does not contain today', () => {
    const { queryByTestId } = render(
      <TimeGridHeader dates={dates} now={new Date(2026, 0, 15)} allDayEvents={[]} onPressEvent={jest.fn()} />
    );
    expect(queryByTestId('day-highlight-2026-08-03')).toBeNull();
    expect(queryByTestId('day-highlight-2026-08-04')).toBeNull();
    expect(queryByTestId('day-highlight-2026-08-05')).toBeNull();
  });
});
