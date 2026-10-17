import type { ReactElement } from 'react';
import { render as rtlRender, waitFor } from '@testing-library/react-native';
import { ThemeWrapper } from '../../helpers/theme';

const render = (ui: ReactElement, opts?: Parameters<typeof rtlRender>[1]) =>
  rtlRender(ui, { wrapper: ThemeWrapper, ...opts });

import { AvailabilityTimeline } from '@/features/event/components/AvailabilityTimeline';
import i18n from '@/utils/i18n';
import type { BusySlot } from '@/types';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

const searchStart = new Date('2026-08-26T00:00:00');
const searchEnd = new Date('2026-09-02T00:00:00');
const initialStart = new Date('2026-08-26T12:00:00');
const durationMs = 60 * 60 * 1000;
const days = [new Date('2026-08-26T00:00:00')];
const columnWidth = 100;
const hourRowHeight = 40;

it('updates attendee chips when mergedBusy changes', async () => {
  const busyBoth: BusySlot[] = [
    { start: new Date('2026-08-26T14:00:00'), end: new Date('2026-08-26T16:00:00'), fbType: 'BUSY', attendees: ['testuser@example.local', 'bob@example.local'] },
  ];

  const { getByText, queryByText, rerender } = render(
    <AvailabilityTimeline
      mergedBusy={busyBoth}
      searchStart={searchStart}
      searchEnd={searchEnd}
      initialStart={initialStart}
      durationMs={durationMs}
      eventTitle="Planning"
      days={days}
      columnWidth={columnWidth}
      hourRowHeight={hourRowHeight}
      attendeeColors={{ 'testuser@example.local': '#E53935', 'bob@example.local': '#1E88E5' }}
      attendeeNames={{ 'testuser@example.local': 'Testuser', 'bob@example.local': 'Bob' }}
      onApplySlot={jest.fn()}
    />,
  );

  await waitFor(() => expect(getByText('Testuser')).toBeTruthy());
  expect(getByText('Bob')).toBeTruthy();

  const busyOne: BusySlot[] = [
    { start: new Date('2026-08-26T14:00:00'), end: new Date('2026-08-26T15:00:00'), fbType: 'BUSY', attendees: ['testuser@example.local'] },
  ];

  rerender(
    <AvailabilityTimeline
      mergedBusy={busyOne}
      searchStart={searchStart}
      searchEnd={searchEnd}
      initialStart={initialStart}
      durationMs={durationMs}
      eventTitle="Planning"
      days={days}
      columnWidth={columnWidth}
      hourRowHeight={hourRowHeight}
      attendeeColors={{ 'testuser@example.local': '#E53935', 'bob@example.local': '#1E88E5' }}
      attendeeNames={{ 'testuser@example.local': 'Testuser', 'bob@example.local': 'Bob' }}
      onApplySlot={jest.fn()}
    />,
  );

  await waitFor(() => expect(queryByText('Bob')).toBeNull());
  expect(getByText('Testuser')).toBeTruthy();
});
