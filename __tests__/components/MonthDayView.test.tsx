import React from 'react';
import { render } from '@testing-library/react-native';
import dayjs from 'dayjs';
import { MonthDayView } from '../../src/components/MonthDayView';
import type { CalendarEvent } from '../../src/types';

// MonthDayView pulls useTheme -> useAppStore (zustand persist), which touches the
// AsyncStorage native module at import. Mock it like the other store-backed suites.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Local-time dates so day formatting is timezone-stable in CI.
const june10 = new Date(2026, 5, 10);
const june15 = new Date(2026, 5, 15);

const event: CalendarEvent = {
  uid: 'e1', href: '/e1.ics', calendarId: 'c1', accountId: 'a1',
  summary: 'Birthday Party',
  dtstart: new Date(2026, 5, 15, 10, 0), dtend: new Date(2026, 5, 15, 11, 0),
  allDay: false, color: '#0082c9', attendees: [], isRecurring: false,
};

function view(date: Date) {
  return (
    <MonthDayView
      date={date}
      events={[event]}
      weekStartsOn={0}
      onSelectDate={jest.fn()}
      onPressEvent={jest.fn()}
      onPressCell={jest.fn()}
    />
  );
}

describe('MonthDayView', () => {
  it('derives the selected day from the date prop and follows prop changes', () => {
    // This is the "Today" fix: the parent owns the date, and changing it must
    // move the highlighted day + day list. Previously the selection was seeded
    // once via useState and never re-synced, so Today did nothing.
    const { getByText, queryByText, rerender } = render(view(june10));

    // Selected day mirrors the prop (June 10); the event (15th) is not listed.
    expect(getByText(dayjs(june10).format('dddd, MMMM D'))).toBeTruthy();
    expect(queryByText('Birthday Party')).toBeNull();

    // Parent moves the date (e.g. "Today" / month nav) → selection follows.
    rerender(view(june15));

    expect(getByText(dayjs(june15).format('dddd, MMMM D'))).toBeTruthy();
    expect(queryByText('Birthday Party')).toBeTruthy();
  });
});
