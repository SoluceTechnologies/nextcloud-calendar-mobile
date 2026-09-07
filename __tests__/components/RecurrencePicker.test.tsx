import { useState } from 'react';
import type { ReactElement } from 'react';
import { render as rtlRender, fireEvent } from '@testing-library/react-native';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { ThemeWrapper } from '../helpers/theme';

dayjs.extend(isoWeek);

const render = (ui: ReactElement, opts?: Parameters<typeof rtlRender>[1]) =>
  rtlRender(ui, { wrapper: ThemeWrapper, ...opts });

import { RecurrencePicker } from '@/features/event/components/RecurrencePicker';
import i18n from '../../src/utils/i18n';
import type { RecurrenceRule } from '../../src/types';

const DTSTART = new Date(2026, 5, 1, 14, 0, 0);

function Harness({
  initial,
  onChange,
  allDay = false,
}: {
  initial?: RecurrenceRule;
  onChange: (rule: RecurrenceRule | undefined) => void;
  allDay?: boolean;
}) {
  const [rule, setRule] = useState<RecurrenceRule | undefined>(initial);
  return (
    <RecurrencePicker
      value={rule}
      dtstart={DTSTART}
      allDay={allDay}
      onChange={(next) => {
        setRule(next);
        onChange(next);
      }}
    />
  );
}

function last(spy: jest.Mock): RecurrenceRule | undefined {
  return spy.mock.calls[spy.mock.calls.length - 1][0];
}

describe('RecurrencePicker end conditions', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('hides the end row while the event does not repeat', () => {
    const { queryByText } = render(<Harness onChange={jest.fn()} />);
    expect(queryByText('Ends')).toBeNull();
  });

  it('shows the end row once a frequency is picked', () => {
    const { getByText } = render(<Harness initial={{ freq: 'WEEKLY' }} onChange={jest.fn()} />);
    expect(getByText('Ends')).toBeTruthy();
    expect(getByText('Never')).toBeTruthy();
  });

  it('sets a default occurrence count when switching to "After"', () => {
    const onChange = jest.fn();
    const { getByText } = render(<Harness initial={{ freq: 'WEEKLY' }} onChange={onChange} />);

    fireEvent.press(getByText('After'));

    expect(last(onChange)).toEqual({ freq: 'WEEKLY', count: 10 });
  });

  it('emits the typed occurrence count', () => {
    const onChange = jest.fn();
    const { getByText, getByDisplayValue } = render(
      <Harness initial={{ freq: 'WEEKLY' }} onChange={onChange} />
    );
    fireEvent.press(getByText('After'));

    fireEvent.changeText(getByDisplayValue('10'), '3');

    expect(last(onChange)).toEqual({ freq: 'WEEKLY', count: 3 });
  });

  it('clamps a zero or empty occurrence count to one', () => {
    const onChange = jest.fn();
    const { getByText, getByDisplayValue } = render(
      <Harness initial={{ freq: 'WEEKLY' }} onChange={onChange} />
    );
    fireEvent.press(getByText('After'));

    fireEvent.changeText(getByDisplayValue('10'), '0');

    expect(last(onChange)).toEqual({ freq: 'WEEKLY', count: 1 });
  });

  it('defaults the end date to one month after the start, inclusive of that day', () => {
    const onChange = jest.fn();
    const { getByText } = render(<Harness initial={{ freq: 'WEEKLY' }} onChange={onChange} />);

    fireEvent.press(getByText('On date'));

    const rule = last(onChange)!;
    expect(rule.count).toBeUndefined();
    expect(rule.until).toEqual(new Date(2026, 6, 1, 23, 59, 59));
  });

  it('keeps the picked end date inclusive by pinning it to the end of that day', () => {
    const onChange = jest.fn();
    const { getByText, getByTestId } = render(
      <Harness initial={{ freq: 'WEEKLY' }} onChange={onChange} />
    );
    fireEvent.press(getByText('On date'));

    fireEvent(getByTestId('recurrence-until-picker'), 'onChange', {
      nativeEvent: { timestamp: new Date(2026, 8, 15, 9, 30, 0).getTime() },
    });

    expect(last(onChange)!.until).toEqual(new Date(2026, 8, 15, 23, 59, 59));
  });

  it('anchors an all-day series end to the local calendar day, like every other all-day date', () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <Harness initial={{ freq: 'WEEKLY' }} allDay onChange={onChange} />
    );

    fireEvent.press(getByText('On date'));

    expect(last(onChange)!.until).toEqual(new Date(2026, 6, 1));
  });

  it('keeps an all-day picked date at local midnight', () => {
    const onChange = jest.fn();
    const { getByText, getByTestId } = render(
      <Harness initial={{ freq: 'WEEKLY' }} allDay onChange={onChange} />
    );
    fireEvent.press(getByText('On date'));

    fireEvent(getByTestId('recurrence-until-picker'), 'onChange', {
      nativeEvent: { timestamp: new Date(2026, 8, 15, 9, 30, 0).getTime() },
    });

    expect(last(onChange)!.until).toEqual(new Date(2026, 8, 15));
  });

  it('switching back to "Never" clears both end conditions', () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <Harness initial={{ freq: 'WEEKLY', count: 4 }} onChange={onChange} />
    );

    fireEvent.press(getByText('Never'));

    expect(last(onChange)).toEqual({ freq: 'WEEKLY' });
  });

  it('switching to "After" drops a previously set end date', () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <Harness initial={{ freq: 'WEEKLY', until: new Date(2026, 6, 1, 23, 59, 59) }} onChange={onChange} />
    );

    fireEvent.press(getByText('After'));

    expect(last(onChange)).toEqual({ freq: 'WEEKLY', count: 10 });
  });
});

describe('RecurrencePicker frequency changes', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  function selectFrequency(getByText: any, from: string, to: string) {
    fireEvent.press(getByText(from));
    fireEvent.press(getByText(to));
  }

  it('keeps the end condition when the frequency changes', () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <Harness initial={{ freq: 'WEEKLY', count: 4 }} onChange={onChange} />
    );

    selectFrequency(getByText, 'Weekly', 'Monthly');

    expect(last(onChange)).toMatchObject({ freq: 'MONTHLY', count: 4 });
  });

  it('keeps the end date when the frequency changes', () => {
    const onChange = jest.fn();
    const until = new Date(2026, 6, 1, 23, 59, 59);
    const { getByText } = render(<Harness initial={{ freq: 'DAILY', until }} onChange={onChange} />);

    selectFrequency(getByText, 'Daily', 'Yearly');

    expect(last(onChange)).toMatchObject({ freq: 'YEARLY', until });
  });

  it('drops the weekday selection when leaving the weekly frequency', () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <Harness initial={{ freq: 'WEEKLY', byDay: ['MO'] }} onChange={onChange} />
    );

    selectFrequency(getByText, 'Weekly', 'Monthly');

    expect(last(onChange)!.byDay).toBeUndefined();
  });

  it('clears the whole rule when the frequency is set to none', () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <Harness initial={{ freq: 'WEEKLY', count: 4 }} onChange={onChange} />
    );

    selectFrequency(getByText, 'Weekly', 'None');

    expect(last(onChange)).toBeUndefined();
  });
});

describe('RecurrencePicker advanced patterns', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('defaults weekly to the start day weekday', () => {
    const onChange = jest.fn();
    const { getByText } = render(<Harness onChange={onChange} />);

    fireEvent.press(getByText('None'));
    fireEvent.press(getByText('Weekly'));

    expect(last(onChange)).toMatchObject({ freq: 'WEEKLY', byDay: ['MO'] });
  });

  it('switches monthly to a weekday-position rule', () => {
    const onChange = jest.fn();
    const { getByText } = render(<Harness onChange={onChange} />);

    fireEvent.press(getByText('None'));
    fireEvent.press(getByText('Monthly'));
    fireEvent.press(getByText('Same day of month'));
    fireEvent.press(getByText('On a weekday'));

    const rule = last(onChange)!;
    expect(rule.freq).toBe('MONTHLY');
    expect(rule.byDay).toEqual(['1MO']);
  });

  it('switches yearly to a month-position rule', () => {
    const onChange = jest.fn();
    const { getByText } = render(<Harness onChange={onChange} />);

    fireEvent.press(getByText('None'));
    fireEvent.press(getByText('Yearly'));
    fireEvent.press(getByText('Same date'));
    fireEvent.press(getByText('On a weekday of a month'));

    const rule = last(onChange)!;
    expect(rule.freq).toBe('YEARLY');
    expect(rule.byMonth).toEqual([6]);
    expect(rule.byDay).toEqual(['1MO']);
  });

  it('switches yearly to a week-number rule', () => {
    const onChange = jest.fn();
    const { getByText } = render(<Harness onChange={onChange} />);

    fireEvent.press(getByText('None'));
    fireEvent.press(getByText('Yearly'));
    fireEvent.press(getByText('Same date'));
    fireEvent.press(getByText('On a week number'));

    const rule = last(onChange)!;
    expect(rule.freq).toBe('YEARLY');
    expect(rule.byWeekNo).toEqual([dayjs(DTSTART).isoWeek()]);
    expect(rule.byDay).toEqual(['MO']);
  });

  it('updates the position and weekday for a monthly pattern', () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <Harness initial={{ freq: 'MONTHLY', byDay: ['1MO'] }} onChange={onChange} />
    );

    fireEvent.press(getByText('First'));
    fireEvent.press(getByText('Third'));

    fireEvent.press(getByText('Mo'));
    fireEvent.press(getByText('Sa'));

    expect(last(onChange)!.byDay).toEqual(['3SA']);
  });

  it('updates the month for a yearly month-position rule', () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <Harness initial={{ freq: 'YEARLY', byMonth: [6], byDay: ['1MO'] }} onChange={onChange} />
    );

    fireEvent.press(getByText('June'));
    fireEvent.press(getByText('July'));

    expect(last(onChange)!.byMonth).toEqual([7]);
  });

  it('updates the week number for a yearly week-number rule', () => {
    const onChange = jest.fn();
    const { getByText, getByDisplayValue } = render(
      <Harness initial={{ freq: 'YEARLY', byWeekNo: [1], byDay: ['MO'] }} onChange={onChange} />
    );

    fireEvent.changeText(getByDisplayValue('1'), '31');

    expect(last(onChange)!.byWeekNo).toEqual([31]);
  });

  it('clamps week number between 1 and 53', () => {
    const onChange = jest.fn();
    const { getByDisplayValue } = render(
      <Harness initial={{ freq: 'YEARLY', byWeekNo: [1], byDay: ['MO'] }} onChange={onChange} />
    );

    fireEvent.changeText(getByDisplayValue('1'), '99');

    expect(last(onChange)!.byWeekNo).toEqual([53]);
  });
});
