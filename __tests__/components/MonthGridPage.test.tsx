import React from 'react';
import { render as rtlRender, fireEvent } from '@testing-library/react-native';
import { ThemeWrapper } from '../helpers/theme';
import { MonthGridPage } from '@/features/calendar/components/MonthGridPage';
import { useSettingsStore } from '@/stores/settingsStore';
import i18n from '@/utils/i18n';
import type { CalendarEvent } from '@/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: ThemeWrapper });
// Chips are hidden from screen readers (the cell speaks for them), so queries must include hidden elements.
const hidden = { includeHiddenElements: true };

function ev(uid: string, dtstart: Date, dtend: Date, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    uid, href: `/${uid}.ics`, calendarId: 'c1', accountId: 'a1',
    summary: uid, dtstart, dtend, allDay: false, color: '#0082c9',
    attendees: [], isRecurring: false, ...extra,
  };
}

const standup = ev('s', new Date(2026, 10, 3, 9), new Date(2026, 10, 3, 9, 15), { summary: 'Daily standup' });
const ferien = ev('f', new Date(2026, 10, 3), new Date(2026, 10, 5), { allDay: true, summary: 'Ferien' });

let onOpenDay: jest.Mock;
let onLongPressDay: jest.Mock;

function page(events: CalendarEvent[]) {
  return (
    <MonthGridPage
      year={2026}
      month={10}
      weekStartsOn={1}
      events={events}
      height={600}
      todayKey="2026-11-01"
      onOpenDay={onOpenDay}
      onLongPressDay={onLongPressDay}
    />
  );
}

describe('MonthGridPage', () => {
  beforeEach(async () => {
    onOpenDay = jest.fn();
    onLongPressDay = jest.fn();
    await i18n.changeLanguage('en');
    useSettingsStore.setState({ language: 'en' });
  });

  it('shows event titles in their day', () => {
    expect(render(page([standup])).getByText('Daily standup', hidden)).toBeTruthy();
  });

  it('renders an all-day multi-day event once, not per day', () => {
    expect(render(page([ferien])).getAllByText('Ferien', hidden)).toHaveLength(1);
  });

  it('shows "+N" when a day overflows', () => {
    // 600 / 6 rows = 100 → 4 lines → 3 drawn + "+5"
    const busy = [8, 9, 10, 11, 12, 13, 14, 15].map((h) =>
      ev(`b${h}`, new Date(2026, 10, 4, h), new Date(2026, 10, 4, h, 30)));
    expect(render(page(busy)).getByText('+5', hidden)).toBeTruthy();
  });

  it('opens the tapped day', () => {
    const { getByTestId } = render(page([]));
    fireEvent.press(getByTestId('month-day-2026-11-13'));
    expect(onOpenDay.mock.calls[0][0]).toEqual(new Date(2026, 10, 13));
  });

  it('starts a new event on long-press', () => {
    const { getByTestId } = render(page([]));
    fireEvent(getByTestId('month-day-2026-11-13'), 'longPress');
    expect(onLongPressDay.mock.calls[0][0]).toEqual(new Date(2026, 10, 13));
  });

  it('renders adjacent-month days', () => {
    const { getByTestId } = render(page([]));
    expect(getByTestId('month-day-2026-10-26')).toBeTruthy();
    expect(getByTestId('month-day-2026-12-06')).toBeTruthy();
  });

  it('labels cells for screen readers', () => {
    const { getByTestId } = render(page([standup]));
    expect(getByTestId('month-day-2026-11-03').props.accessibilityLabel)
      .toBe('Tuesday, November 3, 2026, events: 1');
    expect(getByTestId('month-day-2026-11-04').props.accessibilityLabel)
      .toBe('Wednesday, November 4, 2026, no events');
  });

  it('drops chips when the events prop shrinks (calendar hidden)', () => {
    const r = render(page([standup]));
    r.rerender(page([]));
    expect(r.queryByText('Daily standup', hidden)).toBeNull();
  });

  it('shows (No title) for an untitled event', () => {
    const untitled = ev('u', new Date(2026, 10, 3, 9), new Date(2026, 10, 3, 10), { summary: '' });
    expect(render(page([untitled])).getByText('(No title)', hidden)).toBeTruthy();
  });
});
