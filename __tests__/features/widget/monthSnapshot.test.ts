import type { CalendarEvent } from '@/types';
import { useSettingsStore } from '@/stores/settingsStore';

jest.mock('@/features/widget/core/readEvents', () => ({
  readWidgetEvents: jest.fn(async (): Promise<CalendarEvent[]> => []),
  readContactBirthdayCalendarIds: jest.fn(async () => new Set<string>()),
}));

import { buildMonthWidgetSnapshot, monthGridStart } from '@/features/widget/core/monthSnapshot';
import { readWidgetEvents } from '@/features/widget/core/readEvents';

const mockReadWidgetEvents = readWidgetEvents as jest.MockedFunction<typeof readWidgetEvents>;

function ev(partial: Partial<CalendarEvent> & { dtstart: Date; dtend: Date }): CalendarEvent {
  return {
    uid: 'u', href: '/u.ics', calendarId: 'c', accountId: 'a',
    summary: 'Event', allDay: false, color: '#3b82f6', attendees: [],
    isRecurring: false,
    ...partial,
  };
}

// October 2026: 1st is a Thursday.
const NOW = new Date(2026, 9, 15, 12);

describe('monthGridStart', () => {
  it('starts on Monday when weekStartsOn is 1', () => {
    expect(monthGridStart(new Date(2026, 9, 1), 1)).toEqual(new Date(2026, 8, 28));
  });

  it('starts on Sunday when weekStartsOn is 0', () => {
    expect(monthGridStart(new Date(2026, 9, 1), 0)).toEqual(new Date(2026, 8, 27));
  });

  it('does not pad when the month already starts on the first weekday', () => {
    // November 2026 starts on a Sunday.
    expect(monthGridStart(new Date(2026, 10, 1), 0)).toEqual(new Date(2026, 10, 1));
    expect(monthGridStart(new Date(2026, 10, 1), 1)).toEqual(new Date(2026, 9, 26));
  });
});

describe('buildMonthWidgetSnapshot', () => {
  beforeEach(() => {
    mockReadWidgetEvents.mockReset();
    mockReadWidgetEvents.mockResolvedValue([]);
    useSettingsStore.setState({ language: 'en', weekStartsOn: 1 });
  });

  it('builds 42 days honouring weekStartsOn, flagging today', async () => {
    const snap = await buildMonthWidgetSnapshot(NOW, 0);
    expect(snap).not.toBeNull();
    expect(snap!.days).toHaveLength(42);
    expect(snap!.days[0].dateIso).toBe('2026-09-28');
    expect(snap!.days[0].dayOfWeek).toBe(1);
    expect(snap!.days[41].dayOfWeek).toBe(0);
    expect(snap!.days.find((d) => d.isToday)?.dateIso).toBe('2026-10-15');
    expect(snap!.days.find((d) => d.dateIso === '2026-09-28')?.inMonth).toBe(false);
    expect(snap!.monthLabel).toBe('October 2026');
    expect(snap!.monthOffset).toBe(0);
  });

  it('shifts the grid by one week when the week starts on Sunday', async () => {
    useSettingsStore.setState({ weekStartsOn: 0 });
    const snap = await buildMonthWidgetSnapshot(NOW, 0);
    expect(snap!.days[0].dateIso).toBe('2026-09-27');
    expect(snap!.days[0].dayOfWeek).toBe(0);
  });

  it('navigates months via monthOffset', async () => {
    const snap = await buildMonthWidgetSnapshot(NOW, 1);
    expect(snap!.monthLabel).toBe('November 2026');
    expect(snap!.days[0].dateIso).toBe('2026-10-26');
    expect(snap!.days.every((d) => !d.isToday)).toBe(true);
  });

  it('spans multi-day all-day events across every covered day', async () => {
    mockReadWidgetEvents.mockResolvedValue([
      ev({
        uid: 'multi',
        allDay: true,
        dtstart: new Date(2026, 9, 10),
        dtend: new Date(2026, 9, 12),
      }),
    ]);
    const snap = await buildMonthWidgetSnapshot(NOW, 0);
    const covered = snap!.days.filter((d) => d.events.some((e) => e.uid === 'multi'));
    expect(covered.map((d) => d.dateIso)).toEqual(['2026-10-10', '2026-10-11', '2026-10-12']);
    expect(covered.every((d) => d.totalEvents === 1)).toBe(true);
  });

  it('does not spill a timed event ending exactly at midnight onto the next day', async () => {
    mockReadWidgetEvents.mockResolvedValue([
      ev({
        uid: 'midnight',
        dtstart: new Date(2026, 9, 20, 20),
        dtend: new Date(2026, 9, 21, 0, 0, 0, 0),
      }),
    ]);
    const snap = await buildMonthWidgetSnapshot(NOW, 0);
    const covered = snap!.days.filter((d) => d.events.some((e) => e.uid === 'midnight'));
    expect(covered.map((d) => d.dateIso)).toEqual(['2026-10-20']);
  });

  it('queries the whole grid window including days before the month start', async () => {
    await buildMonthWidgetSnapshot(NOW, 0);
    const [start, end] = mockReadWidgetEvents.mock.calls[0];
    expect(start).toEqual(new Date(2026, 8, 28));
    expect(end.getTime() - start.getTime()).toBe(42 * 86_400_000);
  });
});
