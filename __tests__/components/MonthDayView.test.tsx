import React from 'react';
import { render } from '@testing-library/react-native';
import dayjs from 'dayjs';
import { MonthDayView } from '../../src/components/MonthDayView';
import type { CalendarEvent } from '../../src/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

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
    const { getByText, queryByText, rerender } = render(view(june10));

    expect(getByText(dayjs(june10).format('dddd, MMMM D'))).toBeTruthy();
    expect(queryByText('Birthday Party')).toBeNull();

    rerender(view(june15));

    expect(getByText(dayjs(june15).format('dddd, MMMM D'))).toBeTruthy();
    expect(queryByText('Birthday Party')).toBeTruthy();
  });
});
