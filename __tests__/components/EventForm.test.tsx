import { createRef, type ReactElement } from 'react';
import { render as rtlRender, act, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ThemeWrapper } from '../helpers/theme';

const render = (ui: ReactElement, opts?: Parameters<typeof rtlRender>[1]) =>
  rtlRender(ui, { wrapper: ThemeWrapper, ...opts });
import { EventForm, type EventFormHandle } from '@/features/event/components/EventForm';
import { useSettingsStore } from '../../src/stores/settingsStore';
import i18n from '../../src/utils/i18n';
import type { CalendarMeta } from '../../src/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@/features/event/hooks/useContactSuggestions', () => ({
  useContactSuggestions: jest.fn(),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

jest.mock('@/features/map/utils/geocode', () => ({
  reverseGeocode: jest.fn(),
}));

jest.mock('@/features/places/useSavedPlaces', () => ({
  useSavedPlaces: jest.fn(() => []),
}));

import { useContactSuggestions } from '@/features/event/hooks/useContactSuggestions';
import * as ExpoLocation from 'expo-location';
import { reverseGeocode } from '@/features/map/utils/geocode';

const mockedUseContactSuggestions = useContactSuggestions as jest.MockedFunction<typeof useContactSuggestions>;
const mockedRequestPermission = ExpoLocation.requestForegroundPermissionsAsync as jest.MockedFunction<typeof ExpoLocation.requestForegroundPermissionsAsync>;
const mockedGetPosition = ExpoLocation.getCurrentPositionAsync as jest.MockedFunction<typeof ExpoLocation.getCurrentPositionAsync>;
const mockedReverseGeocode = reverseGeocode as jest.MockedFunction<typeof reverseGeocode>;
import { useSavedPlaces } from '@/features/places/useSavedPlaces';
const mockedUseSavedPlaces = useSavedPlaces as jest.MockedFunction<typeof useSavedPlaces>;

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

describe('EventForm default calendar', () => {
  const twoCalendars: CalendarMeta[] = [
    {
      id: 'personal-url', accountId: 'acc-1', displayName: 'Personal', color: '#0082c9',
      ctag: '1', url: 'https://cloud.example.com/remote.php/dav/calendars/john/personal/', slug: 'personal',
    },
    {
      id: 'work-url', accountId: 'acc-1', displayName: 'Work', color: '#e9322d',
      ctag: '1', url: 'https://cloud.example.com/remote.php/dav/calendars/john/work/', slug: 'work',
    },
  ];
  const account = {
    id: 'acc-1',
    baseUrl: 'https://cloud.example.com',
    username: 'john',
    appPassword: 'x',
  };

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    useSettingsStore.setState({ defaultCalendarByAccount: {} });
  });

  it('pre-selects the stored default calendar for new events', () => {
    const formRef = createRef<EventFormHandle>();
    useSettingsStore.getState().setDefaultCalendar('acc-1', 'work-url');
    const onSubmit = jest.fn();
    const { getByText } = render(
      <EventForm
        ref={formRef}
        {...baseProps}
        calendars={twoCalendars}
        account={account}
        onSubmit={onSubmit}
        initialValues={{ summary: 'Lunch' }}
      />,
    );

    act(() => formRef.current!.submit());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ calendarId: 'work-url' }),
    );
  });

  it('falls back to the heuristic when the stored calendar is gone', () => {
    const formRef = createRef<EventFormHandle>();
    useSettingsStore.getState().setDefaultCalendar('acc-1', 'deleted-url');
    const onSubmit = jest.fn();
    const { getByText } = render(
      <EventForm
        ref={formRef}
        {...baseProps}
        calendars={twoCalendars}
        account={account}
        onSubmit={onSubmit}
        initialValues={{ summary: 'Lunch' }}
      />,
    );

    act(() => formRef.current!.submit());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ calendarId: 'personal-url' }),
    );
  });

  it('falls back to the heuristic when the stored calendar became read-only', () => {
    const formRef = createRef<EventFormHandle>();
    useSettingsStore.getState().setDefaultCalendar('acc-1', 'work-url');
    const readOnlyWork = twoCalendars.map((c) =>
      c.id === 'work-url' ? { ...c, isReadOnly: true } : c,
    );
    const onSubmit = jest.fn();
    const { getByText } = render(
      <EventForm
        ref={formRef}
        {...baseProps}
        calendars={readOnlyWork}
        account={account}
        onSubmit={onSubmit}
        initialValues={{ summary: 'Lunch' }}
      />,
    );

    act(() => formRef.current!.submit());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ calendarId: 'personal-url' }),
    );
  });

  it('lets initialValues.calendarId win over the stored default', () => {
    const formRef = createRef<EventFormHandle>();
    useSettingsStore.getState().setDefaultCalendar('acc-1', 'work-url');
    const onSubmit = jest.fn();
    const { getByText } = render(
      <EventForm
        ref={formRef}
        {...baseProps}
        calendars={twoCalendars}
        account={account}
        onSubmit={onSubmit}
        initialValues={{ summary: 'Lunch', calendarId: 'personal-url' }}
      />,
    );

    act(() => formRef.current!.submit());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ calendarId: 'personal-url' }),
    );
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
    const formRef = createRef<EventFormHandle>();
    const onSubmit = jest.fn();
    const { getByText } = render(
      <EventForm
        ref={formRef}
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
    act(() => formRef.current!.submit());
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('blocks submit when the all-day end is before the start', () => {
    const formRef = createRef<EventFormHandle>();
    const onSubmit = jest.fn();
    const { getByText } = render(
      <EventForm
        ref={formRef}
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
    act(() => formRef.current!.submit());
    expect(getByText('End time must be after start time.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('EventForm start/end duration (#352)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  const changeStart = (startPicker: unknown, d: Date) => {
    const picker = startPicker as { props: { onChange: (e: unknown, d?: Date) => void } };
    act(() => picker.props.onChange({ type: 'set' }, d));
  };

  it('keeps the duration when start minutes change repeatedly', () => {
    const formRef = createRef<EventFormHandle>();
    const onSubmit = jest.fn();
    const { UNSAFE_getAllByType } = render(
      <EventForm
        ref={formRef}
        {...baseProps}
        onSubmit={onSubmit}
        initialValues={{
          summary: 'Shift me',
          dtstart: new Date(2026, 5, 1, 2, 0, 0),
          dtend: new Date(2026, 5, 1, 3, 0, 0),
        }}
      />,
    );

    const startPicker = UNSAFE_getAllByType(DateTimePicker)[0];
    changeStart(startPicker, new Date(2026, 5, 1, 2, 13, 0));
    changeStart(startPicker, new Date(2026, 5, 1, 2, 25, 0));

    act(() => formRef.current!.submit());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        dtstart: new Date(2026, 5, 1, 2, 25, 0),
        dtend: new Date(2026, 5, 1, 3, 25, 0),
      }),
    );
  });

  it('preserves a manually customized duration', () => {
    const formRef = createRef<EventFormHandle>();
    const onSubmit = jest.fn();
    const { UNSAFE_getAllByType } = render(
      <EventForm
        ref={formRef}
        {...baseProps}
        onSubmit={onSubmit}
        initialValues={{
          summary: 'Workshop',
          dtstart: new Date(2026, 5, 1, 14, 0, 0),
          dtend: new Date(2026, 5, 1, 17, 30, 0),
        }}
      />,
    );

    const startPicker = UNSAFE_getAllByType(DateTimePicker)[0];
    changeStart(startPicker, new Date(2026, 5, 1, 16, 0, 0));

    act(() => formRef.current!.submit());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        dtstart: new Date(2026, 5, 1, 16, 0, 0),
        dtend: new Date(2026, 5, 1, 19, 30, 0),
      }),
    );
  });
});

describe('EventForm recurrence end condition', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('submits the occurrence count chosen in the recurrence picker', () => {
    const formRef = createRef<EventFormHandle>();
    const onSubmit = jest.fn();
    const { getByText, getByDisplayValue } = render(
      <EventForm
        ref={formRef}
        {...baseProps}
        onSubmit={onSubmit}
        initialValues={{ summary: 'Standup', rrule: { freq: 'WEEKLY' } }}
      />
    );

    fireEvent.press(getByText('After'));
    fireEvent.changeText(getByDisplayValue('10'), '6');
    act(() => formRef.current!.submit());

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        rrule: expect.objectContaining({ freq: 'WEEKLY', count: 6, until: undefined }),
      })
    );
  });

  it('defaults the recurrence end date relative to the event start', () => {
    const formRef = createRef<EventFormHandle>();
    const onSubmit = jest.fn();
    const { getByText } = render(
      <EventForm
        ref={formRef}
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
    act(() => formRef.current!.submit());

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
    const formRef = createRef<EventFormHandle>();
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
        ref={formRef}
        {...baseProps}
        account={account}
        onSubmit={onSubmit}
        initialValues={{ summary: 'Team sync' }}
      />,
    );

    await waitFor(() => expect(getByText('John Smith')).toBeTruthy());
    expect(queryByText('john.smith@example.com')).toBeTruthy();

    fireEvent.press(getByText('John Smith'));

    act(() => formRef.current!.submit());
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

describe('EventForm current location (C8b)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    jest.clearAllMocks();
    mockedRequestPermission.mockResolvedValue({ status: 'granted' } as never);
    mockedGetPosition.mockResolvedValue({
      coords: { latitude: 47.2184, longitude: -1.5536, altitude: null, accuracy: 10, altitudeAccuracy: null, heading: null, speed: null },
      timestamp: Date.now(),
    } as never);
    mockedReverseGeocode.mockResolvedValue('12, Rue de la Paix, Nantes, France');
  });

  it('fills location and geo from the device position', async () => {
    const formRef = createRef<EventFormHandle>();
    const onSubmit = jest.fn();
    const { getByTestId, getByDisplayValue } = render(
      <EventForm ref={formRef} {...baseProps} onSubmit={onSubmit} initialValues={{ summary: 'Meet' }} />,
    );

    fireEvent.press(getByTestId('event-form-use-my-location'));

    await waitFor(() => expect(getByDisplayValue('12, Rue de la Paix, Nantes, France')).toBeTruthy());

    act(() => formRef.current!.submit());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        location: '12, Rue de la Paix, Nantes, France',
        geo: { lat: 47.2184, lon: -1.5536 },
      }),
    );
  });

  it('falls back to raw coordinates when reverse geocoding fails', async () => {
    const formRef = createRef<EventFormHandle>();
    const onSubmit = jest.fn();
    mockedReverseGeocode.mockResolvedValue(null);
    const { getByTestId, getByDisplayValue } = render(
      <EventForm ref={formRef} {...baseProps} onSubmit={onSubmit} initialValues={{ summary: 'Meet' }} />,
    );

    fireEvent.press(getByTestId('event-form-use-my-location'));

    await waitFor(() => expect(getByDisplayValue('47.21840, -1.55360')).toBeTruthy());

    act(() => formRef.current!.submit());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ geo: { lat: 47.2184, lon: -1.5536 } }),
    );
  });

  it('alerts and does not touch the form when permission is denied', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockedRequestPermission.mockResolvedValue({ status: 'denied' } as never);
    const formRef = createRef<EventFormHandle>();
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <EventForm ref={formRef} {...baseProps} onSubmit={onSubmit} initialValues={{ summary: 'Meet', location: 'Office' }} />,
    );

    fireEvent.press(getByTestId('event-form-use-my-location'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(
      expect.stringContaining('permission'),
    ));
    expect(mockedGetPosition).not.toHaveBeenCalled();

    act(() => formRef.current!.submit());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ location: 'Office', geo: undefined }),
    );
    alertSpy.mockRestore();
  });

  it('alerts when the position lookup fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockedGetPosition.mockRejectedValue(new Error('no fix'));
    const { getByTestId } = render(<EventForm {...baseProps} initialValues={{ summary: 'Meet' }} />);

    fireEvent.press(getByTestId('event-form-use-my-location'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(
      expect.stringContaining('current location'),
    ));
    alertSpy.mockRestore();
  });

  it('clears captured coordinates when the location text is edited manually', async () => {
    const formRef = createRef<EventFormHandle>();
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <EventForm ref={formRef} {...baseProps} onSubmit={onSubmit} initialValues={{ summary: 'Meet' }} />,
    );

    fireEvent.press(getByTestId('event-form-use-my-location'));
    await waitFor(() => expect(mockedReverseGeocode).toHaveBeenCalled());

    fireEvent.changeText(getByTestId('event-form-location'), 'Somewhere else');
    act(() => formRef.current!.submit());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ location: 'Somewhere else', geo: undefined }),
    );
  });
});

describe('EventForm saved places (C8c)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    jest.clearAllMocks();
    mockedUseSavedPlaces.mockReturnValue([
      { id: 'p1', label: 'Bureau', address: 'Nantes', lat: 47.21, lon: -1.55, createdAt: 1 },
    ]);
  });

  it('suggests a saved place while typing and fills location + geo on select', async () => {
    const formRef = createRef<EventFormHandle>();
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <EventForm ref={formRef} {...baseProps} onSubmit={onSubmit} initialValues={{ summary: 'Meet' }} />,
    );

    fireEvent.changeText(getByTestId('event-form-location'), 'bur');
    fireEvent.press(getByTestId('place-suggestion-p1'));

    act(() => formRef.current!.submit());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        location: 'Bureau',
        geo: { lat: 47.21, lon: -1.55 },
      }),
    );
  });
});

describe('EventForm testIDs', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('exposes the testIDs used by the E2E flows', () => {
    const { getByTestId } = render(<EventForm {...baseProps} />);
    for (const id of ['event-form-title', 'event-form-all-day', 'event-form-location', 'event-form-recurrence', 'event-form-alert-default', 'event-form-alert-15', 'event-form-attendee-input', 'event-form-attendee-add']) {
      expect(getByTestId(id)).toBeTruthy();
    }
  });

  it('marks the pressed alert pill as selected (the E2E flow checks it)', () => {
    const { getByTestId } = render(<EventForm {...baseProps} />);
    fireEvent.press(getByTestId('event-form-alert-15'));
    expect(getByTestId('event-form-alert-15').props.accessibilityState).toMatchObject({ selected: true });
    expect(getByTestId('event-form-alert-default').props.accessibilityState).toMatchObject({ selected: false });
  });
});
