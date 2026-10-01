import { Appearance } from 'react-native';

import { useAccountStore } from '@/stores/accountStore';
import { useCalendarStore } from '@/stores/calendarStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { CalendarEvent } from '@/types';

let mockRows: CalendarEvent[] = [];

jest.mock('@/database', () => ({
  database: {
    get: () => ({
      query: () => ({ fetch: async () => mockRows }),
    }),
  },
}));

jest.mock('@/database/mappers/event', () => ({
  mapEventToShared: (row: unknown) => row,
}));

jest.mock('@/utils/normalizeEvent', () => ({
  normalizeEvents: (events: unknown[]) => events,
}));

const mockHomeUpdate: jest.Mock = jest.fn(async () => {});
const mockHomeClear: jest.Mock = jest.fn(async () => {});

jest.mock('@/features/widget/surfaces/homeWidget', () => ({
  homeWidget: {
    isSupported: () => true,
    update: (...args: unknown[]) => mockHomeUpdate(...args),
    clear: (...args: unknown[]) => mockHomeClear(...args),
  },
}));

jest.mock('@/features/widget/surfaces/liveActivity', () => ({
  liveActivity: { isSupported: () => false, update: jest.fn(), clear: jest.fn() },
}));

jest.mock('@/features/widget/storage/widgetStore', () => ({
  readLiveEvent: () => null,
}));

import { syncWidget } from '@/features/widget/sync/syncWidget';

function ev(uid: string, calendarId: string): CalendarEvent {
  return {
    uid,
    href: `/${uid}.ics`,
    calendarId,
    accountId: 'acc-1',
    summary: uid,
    allDay: false,
    color: '#3b82f6',
    attendees: [],
    isRecurring: false,
    dtstart: new Date('2026-08-01T12:00:00Z'),
    dtend: new Date('2026-08-01T13:00:00Z'),
  };
}

function snapshotEvents(): CalendarEvent['uid'][] {
  const entries = mockHomeUpdate.mock.calls[0]?.[0] as
    | { snapshot: { events: { uid: string }[]; sections: { items: { uid: string }[] }[] } }[]
    | undefined;
  if (!entries) return [];
  const snap = entries[0].snapshot;
  return [
    ...snap.events.map((e) => e.uid),
    ...snap.sections.flatMap((s) => s.items.map((e) => e.uid)),
  ];
}

describe('syncWidget calendar filtering', () => {
  beforeEach(() => {
    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('light');
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-08-01T09:00:00Z').getTime());
    useAccountStore.setState({
      activeAccountId: 'acc-1',
      capabilities: { talkEnabled: false, calendarApp: 'available' },
    });
    useCalendarStore.setState({
      hiddenCalendarIds: [],
      notifDisabledCalendarIds: [],
      widgetDisabledCalendarIds: [],
    });
    useSettingsStore.setState({ language: 'en', timeFormat: 'auto' });
    mockHomeUpdate.mockClear();
    mockHomeClear.mockClear();
    mockRows = [];
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('excludes widget-disabled calendars from the pushed timeline', async () => {
    mockRows = [ev('visible', 'cal-a'), ev('hidden-by-widget', 'cal-b')];
    useCalendarStore.setState({ widgetDisabledCalendarIds: ['cal-b'] });

    await syncWidget(new Date('2026-08-01T09:00:00Z'));

    expect(mockHomeUpdate).toHaveBeenCalledTimes(1);
    const uids = snapshotEvents();
    expect(uids).toContain('visible');
    expect(uids).not.toContain('hidden-by-widget');
  });

  it('excludes drawer-hidden calendars via readUpcomingEvents', async () => {
    mockRows = [ev('visible', 'cal-a'), ev('hidden-by-drawer', 'cal-c')];
    useCalendarStore.setState({ hiddenCalendarIds: ['cal-c'] });

    await syncWidget(new Date('2026-08-01T09:00:00Z'));

    expect(mockHomeUpdate).toHaveBeenCalledTimes(1);
    const uids = snapshotEvents();
    expect(uids).toContain('visible');
    expect(uids).not.toContain('hidden-by-drawer');
  });

  it('pushes a refreshed timeline after toggles change the disabled list', async () => {
    mockRows = [ev('a', 'cal-a'), ev('b', 'cal-b')];

    await syncWidget(new Date('2026-08-01T09:00:00Z'));
    expect(snapshotEvents()).toEqual(expect.arrayContaining(['a', 'b']));

    useCalendarStore.setState({ widgetDisabledCalendarIds: ['cal-b'] });
    mockHomeUpdate.mockClear();
    await syncWidget(new Date('2026-08-01T09:05:00Z'));

    expect(mockHomeUpdate).toHaveBeenCalledTimes(1);
    const uids = snapshotEvents();
    expect(uids).toContain('a');
    expect(uids).not.toContain('b');
  });
});
