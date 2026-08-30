import type { ReactElement } from 'react';
import { fireEvent, render as rtlRender } from '@testing-library/react-native';
import { ThemeWrapper } from '../../helpers/theme';

const render = (ui: ReactElement, opts?: Parameters<typeof rtlRender>[1]) =>
  rtlRender(ui, { wrapper: ThemeWrapper, ...opts });

import { AvailabilityTimeline } from '@/features/event/components/AvailabilityTimeline';
import i18n from '@/utils/i18n';
import type { BusySlot } from '@/types';

beforeEach(async () => {
  await i18n.changeLanguage('en');
  jest.clearAllMocks();
});

describe('AvailabilityTimeline', () => {
  const searchStart = new Date('2026-08-28T00:00:00');
  const searchEnd = new Date('2026-09-04T00:00:00');
  const initialStart = new Date('2026-08-31T10:00:00');
  const durationMs = 60 * 60 * 1000; // 1 hour
  const days = [
    new Date('2026-08-30T00:00:00'),
    new Date('2026-08-31T00:00:00'),
    new Date('2026-09-01T00:00:00'),
  ];
  const columnWidth = 100;
  const hourRowHeight = 40;

  it('renders the event brick and its drag handle', () => {
    const { getByTestId } = render(
      <AvailabilityTimeline
        mergedBusy={[]}
        searchStart={searchStart}
        searchEnd={searchEnd}
        initialStart={initialStart}
        durationMs={durationMs}
        eventTitle="Planning"
        days={days}
        columnWidth={columnWidth}
        hourRowHeight={hourRowHeight}
        onApplySlot={jest.fn()}
      />,
    );

    expect(getByTestId('event-brick').props.onStartShouldSetResponder).toBeUndefined();
    expect(getByTestId('event-brick-drag-handle').props.onStartShouldSetResponder).toBeDefined();
  });

  it('renders 3 day columns with busy blocks', () => {
    const busySlots: BusySlot[] = [
      { start: new Date('2026-08-31T10:00:00'), end: new Date('2026-08-31T10:30:00'), fbType: 'BUSY' },
    ];

    const { getByTestId } = render(
      <AvailabilityTimeline
        mergedBusy={busySlots}
        searchStart={searchStart}
        searchEnd={searchEnd}
        initialStart={initialStart}
        durationMs={durationMs}
        eventTitle="Planning"
        days={days}
        columnWidth={columnWidth}
        hourRowHeight={hourRowHeight}
        onApplySlot={jest.fn()}
      />,
    );

    expect(getByTestId('busy-block-1-0')).toBeTruthy();
  });

  it('renders free zones in columns', () => {
    const busySlots: BusySlot[] = [
      { start: new Date('2026-08-31T10:00:00'), end: new Date('2026-08-31T10:30:00'), fbType: 'BUSY' },
    ];

    const { getByTestId } = render(
      <AvailabilityTimeline
        mergedBusy={busySlots}
        searchStart={searchStart}
        searchEnd={searchEnd}
        initialStart={initialStart}
        durationMs={durationMs}
        eventTitle="Planning"
        days={days}
        columnWidth={columnWidth}
        hourRowHeight={hourRowHeight}
        onApplySlot={jest.fn()}
      />,
    );

    expect(getByTestId('free-zone-1-0')).toBeTruthy();
  });

  it('renders event title in the brick', () => {
    const { getByText } = render(
      <AvailabilityTimeline
        mergedBusy={[]}
        searchStart={searchStart}
        searchEnd={searchEnd}
        initialStart={initialStart}
        durationMs={durationMs}
        eventTitle="Team Standup"
        days={days}
        columnWidth={columnWidth}
        hourRowHeight={hourRowHeight}
        onApplySlot={jest.fn()}
      />,
    );

    expect(getByText('Team Standup')).toBeTruthy();
  });

  it('applies the event slot after a long press on a free zone', () => {
    const onApplySlot = jest.fn();
    const { getByTestId } = render(
      <AvailabilityTimeline
        mergedBusy={[]}
        searchStart={searchStart}
        searchEnd={searchEnd}
        initialStart={initialStart}
        durationMs={durationMs}
        eventTitle="Planning"
        days={days}
        columnWidth={columnWidth}
        hourRowHeight={hourRowHeight}
        onApplySlot={onApplySlot}
      />,
    );

    fireEvent(getByTestId('free-zone-1-0'), 'longPress', {
      nativeEvent: { locationY: 40 * 12 },
    });

    expect(onApplySlot).toHaveBeenCalledWith({
      start: new Date('2026-08-31T12:00:00'),
      end: new Date('2026-08-31T13:00:00'),
    });
  });

  it('renders drag hint', () => {
    const { getByText } = render(
      <AvailabilityTimeline
        mergedBusy={[]}
        searchStart={searchStart}
        searchEnd={searchEnd}
        initialStart={initialStart}
        durationMs={durationMs}
        eventTitle="Planning"
        days={days}
        columnWidth={columnWidth}
        hourRowHeight={hourRowHeight}
        onApplySlot={jest.fn()}
      />,
    );

    expect(getByText('Drag the handle to reschedule')).toBeTruthy();
  });
});
