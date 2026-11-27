import {
  syncVisibleRange,
  resetDeltaSyncThrottle,
  resetVisibleSyncCoordination,
} from '../../src/database/sync';
import {
  syncCollection,
  fetchEvents,
  fetchEventsByHrefs,
  fetchEventsForCalendars,
} from '../../src/services/nextcloud/caldav';
import { getDatabaseInstance } from '../../src/database/DatabaseProvider';
import type { Account, CalendarMeta, CalendarEvent } from '../../src/types';

jest.mock('../../src/services/nextcloud/caldav');
jest.mock('../../src/database/DatabaseProvider');
jest.mock('../../src/database/utils/safeTransaction', () => ({
  safeWrite: (_db: unknown, fn: () => Promise<unknown>) => fn(),
}));

const mockSyncCollection = syncCollection as jest.Mock;
const mockFetchEvents = fetchEvents as jest.Mock;
const mockFetchByHrefs = fetchEventsByHrefs as jest.Mock;
const mockFetchForCalendars = fetchEventsForCalendars as jest.Mock;
const mockGetDb = getDatabaseInstance as jest.Mock;

const account: Account = {
  id: 'acc-1',
  displayName: 'Work',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'xxxx',
  davUserId: 'john',
};

const calendar: CalendarMeta = {
  id: 'https://cloud.example.com/remote.php/dav/calendars/john/work/',
  accountId: 'acc-1',
  displayName: 'Work',
  color: '#ff0000',
  ctag: '1',
  url: 'https://cloud.example.com/remote.php/dav/calendars/john/work/',
  slug: 'work',
};

const subscribed: CalendarMeta = {
  ...calendar,
  id: 'https://cloud.example.com/remote.php/dav/calendars/john/holidays/',
  url: 'https://cloud.example.com/remote.php/dav/calendars/john/holidays/',
  displayName: 'Holidays',
  slug: 'holidays',
  isSubscribed: true,
  sourceUrl: 'webcal://example.com/holidays.ics',
};

// A range comfortably inside the ±18 months expansion horizon.
const start = new Date();
const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);

// A range far outside the expansion horizon.
const farStart = new Date(start.getTime() + 40 * 30 * 24 * 60 * 60 * 1000);
const farEnd = new Date(farStart.getTime() + 30 * 24 * 60 * 60 * 1000);

function evt(href: string): CalendarEvent {
  return {
    uid: `${href}-uid`,
    href,
    calendarId: calendar.id,
    accountId: account.id,
    summary: 's',
    allDay: false,
    color: '#fff',
    dtstart: new Date('2026-07-01T09:00:00Z'),
    dtend: new Date('2026-07-01T10:00:00Z'),
    isRecurring: false,
  } as CalendarEvent;
}

function makeDb(eventRows: any[] = []) {
  const batch = jest.fn(async () => {});
  const eventsCol = {
    query: jest.fn(() => ({ fetch: jest.fn(async () => eventRows) })),
    prepareCreate: jest.fn(() => ({ _op: 'create' })),
  };
  const calendarsCol = {
    query: jest.fn(() => ({
      fetch: jest.fn(async () => [
        { syncToken: 'tok', expandedCenter: Date.now(), prepareUpdate: jest.fn(() => ({ _op: 'upd' })) },
      ]),
    })),
  };
  const db = {
    get: jest.fn((table: string) => (table === 'events' ? eventsCol : calendarsCol)),
    batch,
  };
  return { db, batch };
}


async function flushMicrotasks(times = 12): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

beforeEach(() => {
  jest.clearAllMocks();
  resetDeltaSyncThrottle();
  resetVisibleSyncCoordination();
  mockSyncCollection.mockResolvedValue({ changed: [], deleted: [], newToken: 't2', reset: false });
  mockFetchEvents.mockResolvedValue([]);
  mockFetchByHrefs.mockResolvedValue({ events: [], returnedHrefs: new Set() });
  mockFetchForCalendars.mockResolvedValue({ events: [], syncedCalendarIds: [subscribed.id], failures: [] });
});

describe('syncVisibleRange — routing', () => {
  it('routes CalDAV calendars through the delta path', async () => {
    const { db } = makeDb();
    mockGetDb.mockReturnValue(db);

    await syncVisibleRange(account, [calendar], start, end);

    expect(mockSyncCollection).toHaveBeenCalledTimes(1);
    expect(mockSyncCollection).toHaveBeenCalledWith(account, calendar, 'tok');
    expect(mockFetchForCalendars).not.toHaveBeenCalled();
  });

  it('routes subscribed calendars through the full fetch path', async () => {
    const { db } = makeDb();
    mockGetDb.mockReturnValue(db);

    await syncVisibleRange(account, [subscribed], start, end);

    expect(mockFetchForCalendars).toHaveBeenCalledTimes(1);
    expect(mockFetchForCalendars).toHaveBeenCalledWith(account, [subscribed], start, end);
    expect(mockSyncCollection).not.toHaveBeenCalled();
  });

  it('routes app-generated calendars (Deck boards) through the full fetch path', async () => {
    const { db } = makeDb();
    mockGetDb.mockReturnValue(db);
    const deck: CalendarMeta = {
      ...calendar,
      id: 'https://cloud.example.com/remote.php/dav/calendars/john/app-generated--deck--board-3/',
      url: 'https://cloud.example.com/remote.php/dav/calendars/john/app-generated--deck--board-3/',
      slug: 'app-generated--deck--board-3',
      supportsEvents: false,
    };

    await syncVisibleRange(account, [deck], start, end);

    expect(mockFetchForCalendars).toHaveBeenCalledWith(account, [deck], start, end);
    expect(mockSyncCollection).not.toHaveBeenCalled();
  });

  it('splits a mixed list between delta and full paths', async () => {
    const { db } = makeDb();
    mockGetDb.mockReturnValue(db);

    await syncVisibleRange(account, [calendar, subscribed], start, end);

    expect(mockSyncCollection).toHaveBeenCalledTimes(1);
    expect(mockSyncCollection).toHaveBeenCalledWith(account, calendar, 'tok');
    expect(mockFetchForCalendars).toHaveBeenCalledWith(account, [subscribed], start, end);
  });

  it('falls back to the full fetch path outside the expansion horizon', async () => {
    const { db } = makeDb();
    mockGetDb.mockReturnValue(db);

    await syncVisibleRange(account, [calendar], farStart, farEnd);

    expect(mockSyncCollection).not.toHaveBeenCalled();
    expect(mockFetchForCalendars).toHaveBeenCalledWith(account, [calendar], farStart, farEnd);
  });

  it('does nothing when there are no calendars', async () => {
    const { db } = makeDb();
    mockGetDb.mockReturnValue(db);

    await syncVisibleRange(account, [], start, end);

    expect(mockSyncCollection).not.toHaveBeenCalled();
    expect(mockFetchForCalendars).not.toHaveBeenCalled();
  });
});


  it('shares an identical visible sync while it is in flight', async () => {
    const { db } = makeDb();
    mockGetDb.mockReturnValue(db);
    let release!: (value: { changed: string[]; deleted: string[]; newToken: string; reset: boolean }) => void;
    mockSyncCollection.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));

    const first = syncVisibleRange(account, [calendar], start, end);
    const second = syncVisibleRange(account, [calendar], start, end);
    await flushMicrotasks();

    expect(second).toBe(first);
    release({ changed: [], deleted: [], newToken: 't2', reset: false });
    await expect(first).resolves.toBeUndefined();
    expect(mockSyncCollection).toHaveBeenCalledTimes(1);
  });

  it('serializes overlapping ranges and drops an obsolete pending range', async () => {
    const { db } = makeDb();
    mockGetDb.mockReturnValue(db);
    let release!: (value: { changed: string[]; deleted: string[]; newToken: string; reset: boolean }) => void;
    mockSyncCollection
      .mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }))
      .mockResolvedValue({ changed: [], deleted: [], newToken: 't2', reset: false });
    mockFetchByHrefs.mockImplementation(async () => {
      resetDeltaSyncThrottle();
      return { events: [], returnedHrefs: new Set() };
    });

    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() - 20_000);
    const start2 = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const end2 = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    const start3 = new Date(start.getTime() + 48 * 60 * 60 * 1000);
    const end3 = new Date(end.getTime() + 48 * 60 * 60 * 1000);

    const first = syncVisibleRange(account, [calendar], start, end);
    await flushMicrotasks();
    nowSpy.mockRestore();
    const obsolete = syncVisibleRange(account, [calendar], start2, end2);
    const latest = syncVisibleRange(account, [calendar], start3, end3);

    await expect(obsolete).resolves.toBeUndefined();
    release({ changed: [], deleted: [], newToken: 't2', reset: false });
    await expect(first).resolves.toBeUndefined();
    await expect(latest).resolves.toBeUndefined();

    expect(mockSyncCollection).toHaveBeenCalledTimes(2);
  });

describe('syncVisibleRange — throttle', () => {
  it('skips a second sync within the minimum interval', async () => {
    const { db } = makeDb();
    mockGetDb.mockReturnValue(db);

    await syncVisibleRange(account, [calendar], start, end);
    await syncVisibleRange(account, [calendar], start, end);

    expect(mockSyncCollection).toHaveBeenCalledTimes(1);
  });

  it('allows a new sync after the interval elapsed', async () => {
    const { db } = makeDb();
    mockGetDb.mockReturnValue(db);
    const nowSpy = jest.spyOn(Date, 'now');
    const t0 = 1_000_000_000_000;
    nowSpy.mockReturnValue(t0);

    await syncVisibleRange(account, [calendar], start, end);
    nowSpy.mockReturnValue(t0 + 60_000);
    await syncVisibleRange(account, [calendar], start, end);

    expect(mockSyncCollection).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
  });

  it('still fetches subscribed calendars while delta checks are throttled', async () => {
    const { db } = makeDb();
    mockGetDb.mockReturnValue(db);

    await syncVisibleRange(account, [calendar, subscribed], start, end);
    await syncVisibleRange(account, [calendar, subscribed], start, end);

    expect(mockSyncCollection).toHaveBeenCalledTimes(1);
    expect(mockFetchForCalendars).toHaveBeenCalledTimes(2);
  });

  it('throttles per account, not globally', async () => {
    const { db } = makeDb();
    mockGetDb.mockReturnValue(db);
    const other: Account = { ...account, id: 'acc-2' };

    await syncVisibleRange(account, [calendar], start, end);
    await syncVisibleRange(other, [calendar], start, end);

    expect(mockSyncCollection).toHaveBeenCalledTimes(2);
  });

  it('still syncs a calendar that appeared after the last sync', async () => {
    const { db } = makeDb();
    mockGetDb.mockReturnValue(db);
    const added: CalendarMeta = { ...calendar, id: 'added', url: `${calendar.url}added/` };

    await syncVisibleRange(account, [calendar], start, end);
    await syncVisibleRange(account, [calendar, added], start, end);

    expect(mockSyncCollection).toHaveBeenCalledTimes(2);
    expect(mockSyncCollection.mock.calls[1][1]).toBe(added);
  });

  it('does not consume the throttle when only subscribed calendars were synced', async () => {
    const { db } = makeDb();
    mockGetDb.mockReturnValue(db);

    await syncVisibleRange(account, [subscribed], start, end);
    await syncVisibleRange(account, [calendar], start, end);

    expect(mockSyncCollection).toHaveBeenCalledTimes(1);
  });

  it('clears the throttle after a total failure so an immediate retry runs', async () => {
    const { db } = makeDb();
    mockGetDb.mockReturnValue(db);
    mockSyncCollection.mockRejectedValueOnce(new Error('syncCollection HTTP 500'));
    mockFetchForCalendars.mockResolvedValueOnce({ events: [], syncedCalendarIds: [], failures: [new Error('HTTP 500')] });

    await expect(syncVisibleRange(account, [calendar], start, end)).rejects.toThrow();
    await syncVisibleRange(account, [calendar], start, end);

    expect(mockSyncCollection).toHaveBeenCalledTimes(2);
  });
});

describe('syncVisibleRange — failure semantics', () => {
  it('does not throw when only one of several calendars fails', async () => {
    const { db } = makeDb();
    mockGetDb.mockReturnValue(db);
    const other: CalendarMeta = { ...calendar, id: 'cal-2', url: 'https://cloud.example.com/cal2/', slug: 'cal2' };
    mockSyncCollection
      .mockResolvedValueOnce({ changed: [], deleted: [], newToken: 't2', reset: false })
      .mockRejectedValueOnce(new Error('syncCollection HTTP 500'));

    await expect(syncVisibleRange(account, [calendar, other], start, end)).resolves.toBeUndefined();
  });

  it('throws when every calendar fails', async () => {
    const { db } = makeDb();
    mockGetDb.mockReturnValue(db);
    mockSyncCollection.mockRejectedValue(new Error('syncCollection HTTP 500'));
    mockFetchForCalendars.mockResolvedValue({ events: [], syncedCalendarIds: [], failures: [new Error('HTTP 500')] });

    await expect(syncVisibleRange(account, [calendar], start, end)).rejects.toThrow();
  });

  it('throws when the delta path fails and the subscribed path also fails', async () => {
    const { db } = makeDb();
    mockGetDb.mockReturnValue(db);
    mockSyncCollection.mockRejectedValue(new Error('syncCollection HTTP 500'));
    mockFetchForCalendars.mockResolvedValue({ events: [], syncedCalendarIds: [], failures: [new Error('HTTP 500')] });

    await expect(syncVisibleRange(account, [calendar, subscribed], start, end)).rejects.toThrow();
  });
});

describe('syncVisibleRange — delta fallback to range fetch', () => {
  it('falls back to the range fetch when sync-collection fails', async () => {
    const { db } = makeDb();
    mockGetDb.mockReturnValue(db);
    mockSyncCollection.mockRejectedValue(new Error('syncCollection HTTP 501'));
    mockFetchForCalendars.mockResolvedValue({ events: [], syncedCalendarIds: [calendar.id], failures: [] });

    await expect(syncVisibleRange(account, [calendar], start, end)).resolves.toBeUndefined();

    expect(mockFetchForCalendars).toHaveBeenCalledWith(account, [calendar], start, end);
  });

  it('range-fetches only the calendars whose delta sync failed', async () => {
    const { db } = makeDb();
    mockGetDb.mockReturnValue(db);
    const other: CalendarMeta = { ...calendar, id: 'cal-2', url: 'https://cloud.example.com/cal2/', slug: 'cal2' };
    mockSyncCollection
      .mockResolvedValueOnce({ changed: [], deleted: [], newToken: 't2', reset: false })
      .mockRejectedValueOnce(new Error('syncCollection HTTP 501'));

    await syncVisibleRange(account, [calendar, other], start, end);

    expect(mockSyncCollection).toHaveBeenCalledTimes(2);
    expect(mockFetchForCalendars).toHaveBeenCalledWith(account, [other], start, end);
  });

  it('falls back when the multiget guard aborts the delta write', async () => {
    const { db } = makeDb();
    mockGetDb.mockReturnValue(db);
    mockSyncCollection.mockResolvedValue({ changed: ['h1', 'h2'], deleted: [], newToken: 't2', reset: false });
    mockFetchByHrefs.mockResolvedValue({ events: [evt('h1')], returnedHrefs: new Set(['h1']) });

    await expect(syncVisibleRange(account, [calendar], start, end)).resolves.toBeUndefined();

    expect(mockFetchForCalendars).toHaveBeenCalledWith(account, [calendar], start, end);
  });

  it('does not consume the delta throttle when every delta failed', async () => {
    const { db } = makeDb();
    mockGetDb.mockReturnValue(db);
    mockSyncCollection.mockRejectedValueOnce(new Error('syncCollection HTTP 500'));
    mockFetchForCalendars.mockResolvedValue({ events: [], syncedCalendarIds: [calendar.id], failures: [] });

    await syncVisibleRange(account, [calendar], start, end);
    await syncVisibleRange(account, [calendar], start, end);

    expect(mockSyncCollection).toHaveBeenCalledTimes(2);
  });
});

describe('syncVisibleRange — delta path applies remote changes', () => {
  it('recreates fetched events and stores the new sync token', async () => {
    mockSyncCollection.mockResolvedValue({ changed: ['h1'], deleted: [], newToken: 't9', reset: false });
    mockFetchByHrefs.mockResolvedValue({ events: [evt('h1')], returnedHrefs: new Set(['h1']) });
    const row = { syncToken: 'tok', expandedCenter: Date.now(), prepareUpdate: jest.fn(() => ({ _op: 'upd' })) };
    const batch = jest.fn(async () => {});
    const eventsCol = {
      query: jest.fn(() => ({ fetch: jest.fn(async () => []) })),
      prepareCreate: jest.fn(() => ({ _op: 'create' })),
    };
    const calendarsCol = {
      query: jest.fn(() => ({ fetch: jest.fn(async () => [row]) })),
    };
    const db = { get: jest.fn((t: string) => (t === 'events' ? eventsCol : calendarsCol)), batch };
    mockGetDb.mockReturnValue(db);

    await syncVisibleRange(account, [calendar], start, end);

    expect(eventsCol.prepareCreate).toHaveBeenCalledTimes(1);
    expect(row.prepareUpdate).toHaveBeenCalled();
    expect(batch).toHaveBeenCalled();
  });
});

describe('syncVisibleRange — deleteMissing scoping', () => {
  it('does not delete delta-managed rows while syncing subscribed calendars', async () => {
    const caldavRow = {
      id: 'r1',
      uid: 'caldav-uid',
      href: 'h-cal',
      accountId: account.id,
      calendarId: calendar.id,
      summary: 's',
      prepareMarkAsDeleted: jest.fn(() => ({ _op: 'del' })),
      prepareUpdate: jest.fn(() => ({ _op: 'upd' })),
    };
    const staleSubRow = {
      id: 'r2',
      uid: 'sub-gone',
      href: 'h-sub',
      accountId: account.id,
      calendarId: subscribed.id,
      summary: 's',
      prepareMarkAsDeleted: jest.fn(() => ({ _op: 'del' })),
      prepareUpdate: jest.fn(() => ({ _op: 'upd' })),
    };
    const subEvent = { ...evt('h-sub-new'), calendarId: subscribed.id, uid: 'sub-new' };
    mockFetchForCalendars.mockResolvedValue({
      events: [subEvent],
      syncedCalendarIds: [subscribed.id],
      failures: [],
    });

    const eventsCol = {
      query: jest.fn(() => ({ fetch: jest.fn(async () => [caldavRow, staleSubRow]) })),
      prepareCreate: jest.fn(() => ({ _op: 'create' })),
    };
    const calendarsCol = {
      query: jest.fn(() => ({
        fetch: jest.fn(async () => [
          { syncToken: 'tok', expandedCenter: Date.now(), prepareUpdate: jest.fn(() => ({ _op: 'upd' })) },
        ]),
      })),
    };
    const db = {
      get: jest.fn((t: string) => (t === 'events' ? eventsCol : calendarsCol)),
      batch: jest.fn(async () => {}),
    };
    mockGetDb.mockReturnValue(db);

    await syncVisibleRange(account, [calendar, subscribed], start, end);

    expect(caldavRow.prepareMarkAsDeleted).not.toHaveBeenCalled();
    expect(staleSubRow.prepareMarkAsDeleted).toHaveBeenCalled();
  });
});
