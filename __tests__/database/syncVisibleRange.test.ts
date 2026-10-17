import {
  syncVisibleRange,
  resetDeltaSyncThrottle,
} from '../../src/database/sync';
import {
  syncCollection,
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

beforeEach(() => {
  jest.clearAllMocks();
  resetDeltaSyncThrottle();
  mockSyncCollection.mockResolvedValue({ changed: [], deleted: [], newToken: 't2', reset: false });
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
