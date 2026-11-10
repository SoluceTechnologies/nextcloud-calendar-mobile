import { act, renderHook, waitFor } from '@testing-library/react-native';

import { MAX_RESULTS, searchEvents, useLocalSearch } from '@/features/search/useLocalSearch';
import { toSearchable } from '@/features/search/matchEvent';
import { parseQuery } from '@/features/search/parseQuery';
import { useEventsForRange } from '@/database/useEvents';
import { useCalendarsFromDb } from '@/database/useCalendars';
import { useCalendarStore } from '@/stores/calendarStore';
import type { CalendarEvent, CalendarMeta } from '@/types';

jest.mock('@/database/useEvents', () => ({ useEventsForRange: jest.fn(() => []) }));
jest.mock('@/database/useCalendars', () => ({ useCalendarsFromDb: jest.fn(() => []) }));

const now = new Date(2026, 10, 2, 10, 0).getTime();
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function makeEvent(uid: string, start: number, overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    uid,
    href: `https://cloud.test/remote.php/dav/calendars/alice/work/${uid}.ics`,
    calendarId: 'work',
    accountId: 'account-1',
    summary: 'Standup',
    dtstart: new Date(start),
    dtend: new Date(start + HOUR_MS / 4),
    allDay: false,
    color: '#0082c9',
    attendees: [],
    isRecurring: false,
    ...overrides,
  };
}

function makeCalendar(id: string, displayName: string): CalendarMeta {
  return {
    id,
    accountId: 'account-1',
    displayName,
    color: '#0082c9',
    ctag: '',
    url: `https://cloud.test/remote.php/dav/calendars/alice/${id}/`,
    slug: id,
  };
}

const at = (dayOffset: number, hour = 9) => new Date(2026, 10, 2 + dayOffset, hour, 0).getTime();
const occurrence = (dayOffset: number) =>
  makeEvent(`standup_occ_${at(dayOffset) / 1000}`, at(dayOffset), { isRecurring: true });
const search = (events: CalendarEvent[], input: string) =>
  searchEvents(events.map((event) => toSearchable(event, 'Work')), parseQuery(input), now);
const uids = (items: { event: CalendarEvent }[]) => items.map((item) => item.event.uid);

describe('searchEvents', () => {
  it('collapses a daily series to its next upcoming occurrence', () => {
    const series = [-3, -2, -1, 0, 1, 2].map(occurrence);
    const result = search(series, 'standup');
    expect(uids(result.upcoming)).toEqual([occurrence(1).uid]);
    expect(result.past).toEqual([]);
    expect(result.upcomingTotal).toBe(1);
  });

  it('keeps the latest past occurrence of a finished series', () => {
    const result = search([-5, -4, -3].map(occurrence), 'standup');
    expect(uids(result.past)).toEqual([occurrence(-3).uid]);
    expect(result.upcoming).toEqual([]);
  });

  it('collapses on the matching occurrences only', () => {
    const result = search([-3, -2, 1, 2].map(occurrence), 'standup date:past');
    expect(uids(result.past)).toEqual([occurrence(-2).uid]);
  });

  it('keeps one row per series per calendar', () => {
    const shared = [occurrence(1), { ...occurrence(1), calendarId: 'perso' }];
    expect(search(shared, 'standup').upcoming).toHaveLength(2);
  });

  it('orders upcoming ascending and past descending', () => {
    const events = [
      makeEvent('later', now + 3 * DAY_MS),
      makeEvent('sooner', now + DAY_MS),
      makeEvent('long-ago', now - 10 * DAY_MS),
      makeEvent('recent', now - DAY_MS),
    ];
    const result = search(events, 'standup');
    expect(uids(result.upcoming)).toEqual(['sooner', 'later']);
    expect(uids(result.past)).toEqual(['recent', 'long-ago']);
  });

  it('caps each section at 50 and reports totals', () => {
    const events = Array.from({ length: 120 }, (_, index) => makeEvent(`event-${index}`, now + (index + 1) * HOUR_MS));
    const result = search(events, 'standup');
    expect(MAX_RESULTS).toBe(50);
    expect(result.upcoming).toHaveLength(50);
    expect(result.upcomingTotal).toBe(120);
    expect(result.upcoming[0].event.uid).toBe('event-0');
  });

  it('empty query returns nothing', () => {
    expect(search([makeEvent('event', now + DAY_MS)], '  ')).toEqual({
      upcoming: [],
      past: [],
      upcomingTotal: 0,
      pastTotal: 0,
      matchedHrefs: new Set(),
    });
  });
});

describe('useLocalSearch', () => {
  const work = makeCalendar('work', 'Work');
  const perso = makeCalendar('perso', 'Perso');
  const events = [
    makeEvent('work-lunch', now + DAY_MS, {
      summary: 'Lunch',
      attendees: [{ email: 'bob@example.org', displayName: 'Bob' }],
    }),
    makeEvent('perso-lunch', now + 2 * DAY_MS, {
      summary: 'Lunch',
      calendarId: 'perso',
      href: 'https://cloud.test/remote.php/dav/calendars/alice/my%20perso/perso-lunch.ics',
      attendees: [{ email: 'carol@example.org', displayName: 'Carol' }],
    }),
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    (useEventsForRange as jest.Mock).mockReturnValue(events);
    (useCalendarsFromDb as jest.Mock).mockReturnValue([work, perso]);
    useCalendarStore.setState({ hiddenCalendarIds: [] });
  });

  afterEach(() => jest.restoreAllMocks());

  it('subscribes with an empty account id when accountId is null', () => {
    (useEventsForRange as jest.Mock).mockReturnValue([]);
    (useCalendarsFromDb as jest.Mock).mockReturnValue([]);
    renderHook(() => useLocalSearch(null, 'lunch'));
    expect((useEventsForRange as jest.Mock).mock.calls[0][0]).toEqual([]);
    expect(useCalendarsFromDb).toHaveBeenCalledWith(null);
  });

  it('searches every stored event of the account', async () => {
    const { result } = renderHook(() => useLocalSearch('account-1', 'lunch'));
    await waitFor(() => expect(uids(result.current.upcoming)).toEqual(['work-lunch', 'perso-lunch']));
    const [accountId, start, end] = (useEventsForRange as jest.Mock).mock.calls[0];
    expect(accountId).toBe('account-1');
    expect(start.getTime()).toBeLessThan(new Date(1900, 0, 1).getTime());
    expect(end.getTime()).toBeGreaterThan(new Date(2200, 0, 1).getTime());
  });

  it('drops events and suggestions of hidden calendars, and updates when a calendar is hidden', async () => {
    const { result } = renderHook(() => useLocalSearch('account-1', 'lunch'));
    await waitFor(() => expect(result.current.upcoming).toHaveLength(2));
    act(() => useCalendarStore.setState({ hiddenCalendarIds: ['perso'] }));
    await waitFor(() => expect(uids(result.current.upcoming)).toEqual(['work-lunch']));
    expect(result.current.calendars).toEqual([work]);
    expect(result.current.suggestionData).toEqual({
      calendars: [{ name: 'Work', color: '#0082c9' }],
      people: [{ email: 'bob@example.org', displayName: 'Bob' }],
    });
  });

  it('matchedHrefs holds decoded paths of the matching rows only', async () => {
    const { result } = renderHook(() => useLocalSearch('account-1', 'lunch calendar:perso'));
    await waitFor(() =>
      expect(result.current.matchedHrefs).toEqual(new Set(['/remote.php/dav/calendars/alice/my perso/perso-lunch.ics'])),
    );
  });

  it('matchedHrefs keeps every matching occurrence, not only the series representative', () => {
    const series = [-2, -1, 1].map(occurrence);
    const result = searchEvents(series.map((event) => toSearchable(event, 'Work')), parseQuery('standup'), now);
    expect(result.matchedHrefs.size).toBe(3);
  });

  it('dedupes suggestion people by email across occurrences', () => {
    const repeated = Array.from({ length: 30 }, (_, index) =>
      makeEvent(`weekly_occ_${index}`, now + index * DAY_MS, {
        attendees: [
          { email: 'Bob@Example.org', displayName: 'Bob' },
          { email: 'bob@example.org', displayName: 'Bob' },
        ],
      }),
    );
    (useEventsForRange as jest.Mock).mockReturnValue(repeated);
    const { result } = renderHook(() => useLocalSearch('account-1', ''));
    expect(result.current.suggestionData.people).toEqual([{ email: 'Bob@Example.org', displayName: 'Bob' }]);
  });

  it('folds each distinct text once across occurrences', () => {
    const repeated = Array.from({ length: 40 }, (_, index) =>
      makeEvent(`weekly_occ_${index}`, now + index * DAY_MS, { description: 'Same long agenda', location: 'Room 4' }),
    );
    (useEventsForRange as jest.Mock).mockReturnValue(repeated);
    const normalize = jest.spyOn(String.prototype, 'normalize');
    renderHook(() => useLocalSearch('account-1', ''));
    expect(normalize.mock.calls.length).toBeLessThan(20);
  });
});
