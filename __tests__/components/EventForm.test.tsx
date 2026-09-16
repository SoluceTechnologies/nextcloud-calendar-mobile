import type { ReactElement } from 'react';
import { render as rtlRender, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeWrapper } from '../helpers/theme';

const render = (ui: ReactElement, opts?: Parameters<typeof rtlRender>[1]) =>
  rtlRender(ui, { wrapper: ThemeWrapper, ...opts });
import { EventForm } from '@/features/event/components/EventForm';
import i18n from '../../src/utils/i18n';
import type { CalendarMeta } from '../../src/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@/features/event/hooks/useContactSuggestions', () => ({
  useContactSuggestions: jest.fn(),
}));

import { useContactSuggestions } from '@/features/event/hooks/useContactSuggestions';

const mockedUseContactSuggestions = useContactSuggestions as jest.MockedFunction<typeof useContactSuggestions>;

beforeEach(() => {
  mockedUseContactSuggestions.mockReturnValue({ suggestions: [], loading: false, error: null });
});

const calendars: CalendarMeta[] = [
  {
    id: 'cal-url', accountId: 'acc-1', displayName: 'Personal', color: '#0082c9',
    ctag: '1', url: 'https://cloud.example.com/remote.php/dav/calendars/john/personal/', slug: 'personal',
  },
];

const baseProps = {
  calendars,
  organizerEmail: 'john@example.com',
  organizerName: 'John',
  onSubmit: () => {},
  loading: false,
};

const LOCKED_CAPTION = "Calendar can't be changed for recurring events.";

describe('EventForm calendar picker', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows the locked caption when calendar change is disabled (recurring edit)', () => {
    const { getByText } = render(<EventForm {...baseProps} disableCalendarChange />);
    expect(getByText(LOCKED_CAPTION)).toBeTruthy();
  });

  it('does not show the locked caption when calendar change is allowed', () => {
    const { queryByText } = render(<EventForm {...baseProps} />);
    expect(queryByText(LOCKED_CAPTION)).toBeNull();
  });

  it('excludes calendars that cannot hold events (e.g. Deck boards) from the picker', () => {
    const withDeck: CalendarMeta[] = [
      ...calendars,
      {
        id: 'deck-url', accountId: 'acc-1', displayName: 'Deck Roadmap', color: '#ff0000',
        ctag: '1', url: 'https://cloud.example.com/remote.php/dav/calendars/john/app-generated--deck--board-3/',
        slug: 'app-generated--deck--board-3', supportsEvents: false,
      },
    ];
    const { queryByText, getByText } = render(<EventForm {...baseProps} calendars={withDeck} />);
    expect(getByText('Personal')).toBeTruthy();
    expect(queryByText('Deck Roadmap')).toBeNull();
  });
});

describe('EventForm all-day end date', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows the End field when the event is all-day', () => {
    const { getByText } = render(
      <EventForm {...baseProps} initialValues={{ allDay: true }} />
    );
    expect(getByText('End')).toBeTruthy();
  });

  it('shows the End field for timed events too', () => {
    const { getByText } = render(
      <EventForm {...baseProps} initialValues={{ allDay: false }} />
    );
    expect(getByText('End')).toBeTruthy();
  });

  it('allows submit when the all-day end equals the start (single-day event)', () => {
    const onSubmit = jest.fn();
    const { getByText } = render(
      <EventForm
        {...baseProps}
        onSubmit={onSubmit}
        initialValues={{
          summary: 'Day trip',
          allDay: true,
          dtstart: new Date(2026, 5, 20),
          dtend: new Date(2026, 5, 20),
        }}
      />
    );
    fireEvent.press(getByText('Save Event'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('blocks submit when the all-day end is before the start', () => {
    const onSubmit = jest.fn();
    const { getByText } = render(
      <EventForm
        {...baseProps}
        onSubmit={onSubmit}
        initialValues={{
          summary: 'Trip',
          allDay: true,
          dtstart: new Date(2026, 5, 20),
          dtend: new Date(2026, 5, 18),
        }}
      />
    );
    fireEvent.press(getByText('Save Event'));
    expect(getByText('End time must be after start time.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('EventForm recurrence end condition', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('submits the occurrence count chosen in the recurrence picker', () => {
    const onSubmit = jest.fn();
    const { getByText, getByDisplayValue } = render(
      <EventForm
        {...baseProps}
        onSubmit={onSubmit}
        initialValues={{ summary: 'Standup', rrule: { freq: 'WEEKLY' } }}
      />
    );

    fireEvent.press(getByText('After'));
    fireEvent.changeText(getByDisplayValue('10'), '6');
    fireEvent.press(getByText('Save Event'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        rrule: expect.objectContaining({ freq: 'WEEKLY', count: 6, until: undefined }),
      })
    );
  });

  it('defaults the recurrence end date relative to the event start', () => {
    const onSubmit = jest.fn();
    const { getByText } = render(
      <EventForm
        {...baseProps}
        onSubmit={onSubmit}
        initialValues={{
          summary: 'Standup',
          dtstart: new Date(2026, 5, 1, 9, 0, 0),
          dtend: new Date(2026, 5, 1, 10, 0, 0),
          rrule: { freq: 'WEEKLY' },
        }}
      />
    );

    fireEvent.press(getByText('On date'));
    fireEvent.press(getByText('Save Event'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        rrule: expect.objectContaining({ until: new Date(2026, 6, 1, 23, 59, 59) }),
      })
    );
  });
});

describe('EventForm contact suggestions', () => {
  const account = {
    id: 'acc-1',
    baseUrl: 'https://cloud.example.com',
    username: 'john',
    appPassword: 'xxxx',
  };

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockedUseContactSuggestions.mockReturnValue({ suggestions: [], loading: false, error: null });
  });

  it('shows contact suggestions from the account', async () => {
    mockedUseContactSuggestions.mockReturnValue({
      suggestions: [
        { id: '1', displayName: 'John Smith', email: 'john.smith@example.com', source: 'user' },
      ],
      loading: false,
      error: null,
    });

    const onSubmit = jest.fn();
    const { getByText, queryByText } = render(
      <EventForm
        {...baseProps}
        account={account}
        onSubmit={onSubmit}
        initialValues={{ summary: 'Team sync' }}
      />,
    );

    await waitFor(() => expect(getByText('John Smith')).toBeTruthy());
    expect(queryByText('john.smith@example.com')).toBeTruthy();

    fireEvent.press(getByText('John Smith'));

    fireEvent.press(getByText('Save Event'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        attendees: [{ displayName: 'John Smith', email: 'john.smith@example.com' }],
      }),
    );
  });

  it('does not request suggestions when no account is provided', () => {
    render(<EventForm {...baseProps} />);
    expect(mockedUseContactSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({ account: null }),
    );
  });
});
