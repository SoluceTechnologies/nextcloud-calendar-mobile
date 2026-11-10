import { Platform } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

import { DarkThemeWrapper, ThemeWrapper } from '../../helpers/theme';
import { ValueSuggestions } from '@/features/search/components/ValueSuggestions';
import { buildValueSuggestions, type Suggestion } from '@/features/search/suggestions';

type PickerChange = (event: { type: string }, date?: Date) => void;
const mockPicker = DateTimePicker as unknown as {
  lastOnChange: PickerChange | null;
  lastValue: unknown;
  lastThemeVariant: unknown;
};

jest.mock('@react-native-community/datetimepicker', () => {
  function MockPicker(props: { onChange: unknown; value: unknown; themeVariant?: unknown }) {
    MockPicker.lastOnChange = props.onChange;
    MockPicker.lastValue = props.value;
    MockPicker.lastThemeVariant = props.themeVariant;
    return null;
  }
  MockPicker.lastOnChange = null as unknown;
  MockPicker.lastValue = null as unknown;
  MockPicker.lastThemeVariant = null as unknown;
  return MockPicker;
});

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({
    t: (key: string, options?: { value?: string }) => (options?.value ? `${key}:${options.value}` : key),
  }),
}));

const calendars: Suggestion[] = [{ key: 'calendar', value: 'Perso', label: 'Perso', color: '#D4537E' }];
const dates = buildValueSuggestions('date', '', { calendars: [], people: [] });

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 8, 13, 12) });
  mockPicker.lastOnChange = null;
  mockPicker.lastValue = null;
  mockPicker.lastThemeVariant = null;
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it('offers to use the typed value as is', () => {
  const onUseTyped = jest.fn();
  render(
    <ValueSuggestions pending="calendar" typed="per " suggestions={calendars} onPick={jest.fn()} onUseTyped={onUseTyped} />,
    { wrapper: ThemeWrapper },
  );
  fireEvent.press(screen.getByText('search.use:per'));
  expect(onUseTyped).toHaveBeenCalled();
});

it('picks a suggestion with its label and color', () => {
  const onPick = jest.fn();
  render(<ValueSuggestions pending="calendar" typed="" suggestions={calendars} onPick={onPick} onUseTyped={jest.fn()} />, {
    wrapper: ThemeWrapper,
  });
  expect(screen.queryByTestId('suggestion-use')).toBeNull();
  fireEvent.press(screen.getByTestId('suggestion-Perso'));
  expect(onPick).toHaveBeenCalledWith({ value: 'Perso', label: 'Perso', color: '#D4537E' });
});

it('attendee rows show an avatar and the email', () => {
  const attendees: Suggestion[] = [
    { key: 'attendee', value: 'alice@example.org', label: 'Alice Martin', detail: 'alice@example.org' },
  ];
  render(<ValueSuggestions pending="attendee" typed="" suggestions={attendees} onPick={jest.fn()} onUseTyped={jest.fn()} />, {
    wrapper: ThemeWrapper,
  });
  expect(screen.getByText('AM')).toBeTruthy();
  expect(screen.getByText('alice@example.org')).toBeTruthy();
});

it('shows date presets in order then Before/After', () => {
  const onPick = jest.fn();
  render(<ValueSuggestions pending="date" typed="" suggestions={dates} onPick={onPick} onUseTyped={jest.fn()} />, {
    wrapper: ThemeWrapper,
  });
  const rows = screen.getAllByTestId(/^suggestion-/).map((row) => row.props.testID);
  expect(rows).toEqual([
    'suggestion-today',
    'suggestion-tomorrow',
    'suggestion-week',
    'suggestion-month',
    'suggestion-upcoming',
    'suggestion-past',
    'suggestion-before',
    'suggestion-after',
  ]);
  expect(screen.getByText('search.date.upcoming')).toBeTruthy();
  fireEvent.press(screen.getByTestId('suggestion-today'));
  expect(onPick).toHaveBeenCalledWith({ value: 'today', label: 'today', color: undefined });
});

it('commits a before-date filter from the picker', () => {
  const onPick = jest.fn();
  render(<ValueSuggestions pending="date" typed="" suggestions={dates} onPick={onPick} onUseTyped={jest.fn()} />, {
    wrapper: ThemeWrapper,
  });
  fireEvent.press(screen.getByTestId('suggestion-before'));
  expect(mockPicker.lastOnChange).not.toBeNull();
  act(() => mockPicker.lastOnChange!({ type: 'set' }, new Date(2026, 9, 1, 12)));
  expect(onPick).toHaveBeenCalledWith({ value: '<2026-10-01', label: '<2026-10-01' });
});

it('commits nothing when the picker is dismissed', () => {
  const onPick = jest.fn();
  render(<ValueSuggestions pending="date" typed="" suggestions={dates} onPick={onPick} onUseTyped={jest.fn()} />, {
    wrapper: ThemeWrapper,
  });
  fireEvent.press(screen.getByTestId('suggestion-after'));
  expect(mockPicker.lastOnChange).not.toBeNull();
  act(() => mockPicker.lastOnChange!({ type: 'dismissed' }, new Date(2026, 9, 1, 12)));
  expect(onPick).not.toHaveBeenCalled();
});

it('keeps the open picker stable while the screen re-renders', () => {
  const { rerender } = render(
    <ValueSuggestions pending="date" typed="" suggestions={dates} onPick={jest.fn()} onUseTyped={jest.fn()} />,
    { wrapper: ThemeWrapper },
  );
  fireEvent.press(screen.getByTestId('suggestion-after'));
  const handler = mockPicker.lastOnChange;
  const seed = mockPicker.lastValue;
  const onPick = jest.fn();
  rerender(<ValueSuggestions pending="date" typed="" suggestions={dates} onPick={onPick} onUseTyped={jest.fn()} />);
  expect(mockPicker.lastOnChange).toBe(handler);
  expect(mockPicker.lastValue).toBe(seed);
  act(() => mockPicker.lastOnChange!({ type: 'set' }, new Date(2026, 9, 1, 12)));
  expect(onPick).toHaveBeenCalledWith({ value: '>2026-10-01', label: '>2026-10-01' });
});

it.each([
  ['light', ThemeWrapper],
  ['dark', DarkThemeWrapper],
] as const)('gives the picker the %s theme variant of the app', (variant, wrapper) => {
  render(<ValueSuggestions pending="date" typed="" suggestions={dates} onPick={jest.fn()} onUseTyped={jest.fn()} />, {
    wrapper,
  });
  fireEvent.press(screen.getByTestId('suggestion-before'));
  expect(mockPicker.lastThemeVariant).toBe(variant);
});

it('draws a dot only for suggestions that have a color', () => {
  const suggestions: Suggestion[] = [
    { key: 'calendar', value: 'design', label: 'design', color: '#D4537E' },
    { key: 'calendar', value: 'todo', label: 'todo' },
    { key: 'calendar', value: 'done', label: 'done', color: '' },
  ];
  render(<ValueSuggestions pending="calendar" typed="" suggestions={suggestions} onPick={jest.fn()} onUseTyped={jest.fn()} />, {
    wrapper: ThemeWrapper,
  });
  expect(within(screen.getByTestId('suggestion-design')).getByTestId('suggestion-dot')).toBeTruthy();
  expect(within(screen.getByTestId('suggestion-todo')).queryByTestId('suggestion-dot')).toBeNull();
  expect(within(screen.getByTestId('suggestion-done')).queryByTestId('suggestion-dot')).toBeNull();
});

it('draws no dot on a date preset', () => {
  render(<ValueSuggestions pending="date" typed="" suggestions={dates} onPick={jest.fn()} onUseTyped={jest.fn()} />, {
    wrapper: ThemeWrapper,
  });
  expect(screen.queryByTestId('suggestion-dot')).toBeNull();
});

describe('calendar navigation on iOS', () => {
  const open = (onPick = jest.fn()) => {
    render(<ValueSuggestions pending="date" typed="" suggestions={dates} onPick={onPick} onUseTyped={jest.fn()} />, {
      wrapper: ThemeWrapper,
    });
    fireEvent.press(screen.getByTestId('suggestion-before'));
    return onPick;
  };
  const change = (date: Date) => act(() => mockPicker.lastOnChange!({ type: 'set' }, date));

  it('keeps the picker open when only the month moves', () => {
    const onPick = open();
    change(new Date(2026, 9, 13, 12));
    expect(onPick).not.toHaveBeenCalled();
    expect(mockPicker.lastValue).toEqual(new Date(2026, 9, 13, 12));
    expect(screen.getByText('search.use:<2026-10-13')).toBeTruthy();
  });

  it('keeps the picker open when only the year moves', () => {
    const onPick = open();
    change(new Date(2027, 8, 13, 12));
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByText('search.use:<2027-09-13')).toBeTruthy();
  });

  it('commits the day that is tapped after a month move', () => {
    const onPick = open();
    change(new Date(2026, 9, 13, 12));
    change(new Date(2026, 9, 20, 12));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith({ value: '<2026-10-20', label: '<2026-10-20' });
    expect(screen.queryByTestId('suggestion-use-date')).toBeNull();
  });

  it('commits a day tapped in the open month', () => {
    const onPick = open();
    change(new Date(2026, 8, 20, 12));
    expect(onPick).toHaveBeenCalledWith({ value: '<2026-09-20', label: '<2026-09-20' });
  });

  it.each([
    ['Feb 28', new Date(2026, 0, 31, 12), new Date(2026, 1, 28, 12), '<2026-02-28'],
    ['Feb 29', new Date(2028, 0, 31, 12), new Date(2028, 1, 29, 12), '<2028-02-29'],
  ])('treats a clamped move to %s as navigation', (_name, from, to, expected) => {
    jest.setSystemTime(from);
    const onPick = open();
    change(to);
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByText(`search.use:${expected}`)).toBeTruthy();
  });

  it('commits a tap on a day other than the clamped one', () => {
    jest.setSystemTime(new Date(2026, 0, 31, 12));
    const onPick = open();
    change(new Date(2026, 1, 27, 12));
    expect(onPick).toHaveBeenCalledWith({ value: '<2026-02-27', label: '<2026-02-27' });
  });

  it('commits the draft from the use row after a month move', () => {
    const onPick = open();
    change(new Date(2026, 9, 13, 12));
    fireEvent.press(screen.getByTestId('suggestion-use-date'));
    expect(onPick).toHaveBeenCalledWith({ value: '<2026-10-13', label: '<2026-10-13' });
    expect(screen.queryByTestId('suggestion-use-date')).toBeNull();
  });

  it('commits today from the use row when nothing was moved', () => {
    const onPick = open();
    fireEvent.press(screen.getByTestId('suggestion-use-date'));
    expect(onPick).toHaveBeenCalledWith({ value: '<2026-09-13', label: '<2026-09-13' });
  });

  it('offers no use row before the picker is open', () => {
    render(<ValueSuggestions pending="date" typed="" suggestions={dates} onPick={jest.fn()} onUseTyped={jest.fn()} />, {
      wrapper: ThemeWrapper,
    });
    expect(screen.queryByTestId('suggestion-use-date')).toBeNull();
  });
});

describe('date dialog on Android', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
  });

  it('commits any set, even one that keeps the day of the month', () => {
    const onPick = jest.fn();
    render(<ValueSuggestions pending="date" typed="" suggestions={dates} onPick={onPick} onUseTyped={jest.fn()} />, {
      wrapper: ThemeWrapper,
    });
    fireEvent.press(screen.getByTestId('suggestion-before'));
    expect(screen.queryByTestId('suggestion-use-date')).toBeNull();
    act(() => mockPicker.lastOnChange!({ type: 'set' }, new Date(2026, 9, 13, 12)));
    expect(onPick).toHaveBeenCalledWith({ value: '<2026-10-13', label: '<2026-10-13' });
  });
});
