import { syncCalendarDelta, syncEvents, markLocalWrite } from '../../src/database/sync';
import { syncCollection, fetchEventsByHrefs, fetchEventsForCalendars } from '../../src/services/nextcloud/caldav';
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

function makeRow(href: string) {
  return { href, prepareMarkAsDeleted: jest.fn(() => ({ _op: 'del', href })) };
}

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

/** Shape returned by fetchEventsForCalendars: per-calendar partial success. */
function outcome(
  events: CalendarEvent[],
  syncedCalendarIds: string[] = [calendar.id],
  failures: unknown[] = [],
) {
  return { events, syncedCalendarIds, failures };
}

function makeDb(opts: { calendarRow?: any; eventRows?: any[] }) {
  const eventRows = opts.eventRows ?? [];
  const calendarRows = opts.calendarRow ? [opts.calendarRow] : [];
  const batch = jest.fn(async () => {});
  const prepareCreate = jest.fn(() => ({ _op: 'create' }));
  const eventsCol = {
    query: jest.fn(() => ({ fetch: jest.fn(async () => eventRows) })),
    prepareCreate,
  };
  const calendarsCol = {
    query: jest.fn(() => ({ fetch: jest.fn(async () => calendarRows) })),
  };
  const db = {
    get: jest.fn((table: string) => (table === 'events' ? eventsCol : calendarsCol)),
    write: jest.fn(async (fn: () => Promise<unknown>) => fn()),
    batch,
  };
  return { db, batch, prepareCreate };
}

const noTokenRow = () => ({ syncToken: undefined, expandedCenter: undefined, prepareUpdate: jest.fn(() => ({ _op: 'upd' })) });
const tokenRow = () => ({ syncToken: 'tok', expandedCenter: Date.now(), prepareUpdate: jest.fn(() => ({ _op: 'upd' })) });

beforeEach(() => jest.clearAllMocks());

describe('syncCalendarDelta — non-destructive guards', () => {
  it('does NOT wipe when a full sync enumerates hrefs but parses zero events', async () => {
    mockSyncCollection.mockResolvedValue({ changed: ['h1', 'h2'], deleted: [], newToken: 't2', reset: false });
    mockFetchByHrefs.mockResolvedValue([]);
    const existing = [makeRow('h1'), makeRow('h2')];
    const { db, batch } = makeDb({ calendarRow: noTokenRow(), eventRows: existing });
    mockGetDb.mockReturnValue(db);

    await syncCalendarDelta(account, calendar);

    expect(batch).not.toHaveBeenCalled();
    existing.forEach((r) => expect(r.prepareMarkAsDeleted).not.toHaveBeenCalled());
  });

  it('does NOT delete when a full sync parses fewer events than expected', async () => {
    mockSyncCollection.mockResolvedValue({ changed: ['h1', 'h2', 'h3'], deleted: [], newToken: 't2', reset: false });
    mockFetchByHrefs.mockResolvedValue([evt('h1')]);
    const h1 = makeRow('h1');
    const h2 = makeRow('h2');
    const h3 = makeRow('h3');
    const { db, batch, prepareCreate } = makeDb({ calendarRow: noTokenRow(), eventRows: [h1, h2, h3] });
    mockGetDb.mockReturnValue(db);

    await syncCalendarDelta(account, calendar);

    expect(batch).not.toHaveBeenCalled();
    expect(h1.prepareMarkAsDeleted).not.toHaveBeenCalled();
    expect(h2.prepareMarkAsDeleted).not.toHaveBeenCalled();
    expect(h3.prepareMarkAsDeleted).not.toHaveBeenCalled();
    expect(prepareCreate).not.toHaveBeenCalled();
  });

  it('does NOT delete when a delta sync parses fewer events than expected', async () => {
    mockSyncCollection.mockResolvedValue({ changed: ['h1', 'h2'], deleted: ['h3'], newToken: 't2', reset: false });
    mockFetchByHrefs.mockResolvedValue([evt('h1')]);
    const h1 = makeRow('h1');
    const h2 = makeRow('h2');
    const h3 = makeRow('h3');
    const { db, batch, prepareCreate } = makeDb({ calendarRow: tokenRow(), eventRows: [h1, h2, h3] });
    mockGetDb.mockReturnValue(db);

    await syncCalendarDelta(account, calendar);

    expect(batch).not.toHaveBeenCalled();
    [h1, h2, h3].forEach((r) => expect(r.prepareMarkAsDeleted).not.toHaveBeenCalled());
    expect(prepareCreate).not.toHaveBeenCalled();
  });

  it('does NOT delete existing rows when a full sync enumerates zero members (untrusted empty)', async () => {
    mockSyncCollection.mockResolvedValue({ changed: [], deleted: [], newToken: 't2', reset: false });
    mockFetchByHrefs.mockResolvedValue([]);
    const existing = [makeRow('h1')];
    const { db, batch } = makeDb({ calendarRow: noTokenRow(), eventRows: existing });
    mockGetDb.mockReturnValue(db);

    await syncCalendarDelta(account, calendar);

    expect(existing[0].prepareMarkAsDeleted).not.toHaveBeenCalled();
    expect(batch).toHaveBeenCalled();
  });

  it('full sync reconcile: replaces fetched hrefs and removes stale ones', async () => {
    mockSyncCollection.mockResolvedValue({ changed: ['h1', 'h2'], deleted: [], newToken: 't2', reset: false });
    mockFetchByHrefs.mockResolvedValue([evt('h1'), evt('h2')]);
    const h1old = makeRow('h1');
    const h3stale = makeRow('h3');
    const { db, batch, prepareCreate } = makeDb({ calendarRow: noTokenRow(), eventRows: [h1old, h3stale] });
    mockGetDb.mockReturnValue(db);

    await syncCalendarDelta(account, calendar);

    expect(h1old.prepareMarkAsDeleted).toHaveBeenCalled();
    expect(h3stale.prepareMarkAsDeleted).toHaveBeenCalled();
    expect(prepareCreate).toHaveBeenCalledTimes(2);
    expect(batch).toHaveBeenCalled();
  });

  it('incremental: deletes explicit removals + replaces fetched, leaves untouched hrefs intact', async () => {
    mockSyncCollection.mockResolvedValue({ changed: ['h1'], deleted: ['h2'], newToken: 't3', reset: false });
    mockFetchByHrefs.mockResolvedValue([evt('h1')]);
    const h1old = makeRow('h1');
    const h2gone = makeRow('h2');
    const h9other = makeRow('h9');
    const { db, prepareCreate } = makeDb({ calendarRow: tokenRow(), eventRows: [h1old, h2gone, h9other] });
    mockGetDb.mockReturnValue(db);

    await syncCalendarDelta(account, calendar);

    expect(h1old.prepareMarkAsDeleted).toHaveBeenCalled();
    expect(h2gone.prepareMarkAsDeleted).toHaveBeenCalled();
    expect(h9other.prepareMarkAsDeleted).not.toHaveBeenCalled();
    expect(prepareCreate).toHaveBeenCalledTimes(1);
  });
});

describe('syncEvents — local writes win over an in-flight pull', () => {
  const start = new Date('2026-07-01T00:00:00Z');
  const end = new Date('2026-08-01T00:00:00Z');

  function windowRow(uid: string) {
    return {
      uid,
      href: `h-${uid}`,
      accountId: account.id,
      calendarId: calendar.id,
      summary: 'old',
      prepareMarkAsDeleted: jest.fn(() => ({ _op: 'del', uid })),
      prepareUpdate: jest.fn(() => ({ _op: 'upd', uid })),
    };
  }

  it('does not resurrect an event deleted while the fetch was running', async () => {
    // Remote snapshot predates the deletion: it still carries the event, and the
    // local row is already gone.
    mockFetchForCalendars.mockImplementation(async () => {
      markLocalWrite();
      return outcome([{ ...evt('h1'), uid: 'gone-uid' }]);
    });
    const { db, batch } = makeDb({ eventRows: [] });
    mockGetDb.mockReturnValue(db);

    await syncEvents(account, [calendar], start, end);

    expect(batch).not.toHaveBeenCalled();
  });

  it('does not overwrite an edit made while the fetch was running', async () => {
    const row = windowRow('edited-uid');
    mockFetchForCalendars.mockImplementation(async () => {
      markLocalWrite();
      return outcome([{ ...evt('h1'), uid: 'edited-uid', summary: 'stale' }]);
    });
    const { db, batch } = makeDb({ eventRows: [row] });
    mockGetDb.mockReturnValue(db);

    await syncEvents(account, [calendar], start, end);

    expect(batch).not.toHaveBeenCalled();
  });

  it('aborts before preparing any record, leaving none with pending changes', async () => {
    // The regression: prepareUpdate / prepareMarkAsDeleted mutate the cached
    // WatermelonDB instance synchronously and are cleared only by db.batch. If
    // the epoch guard aborts AFTER preparing, the instance keeps its pending
    // state, and the next sync's prepareUpdate on that same cached instance
    // throws "Cannot update a record with pending changes". So on abort, nothing
    // may be prepared at all.
    const edited = windowRow('edited-uid');
    const dropped = windowRow('dropped-uid');
    mockFetchForCalendars.mockImplementation(async () => {
      markLocalWrite();
      return outcome([{ ...evt('h1'), uid: 'edited-uid', summary: 'stale' }]);
    });
    const { db, batch } = makeDb({ eventRows: [edited, dropped] });
    mockGetDb.mockReturnValue(db);

    await syncEvents(account, [calendar], start, end);

    expect(batch).not.toHaveBeenCalled();
    expect(edited.prepareUpdate).not.toHaveBeenCalled();
    expect(dropped.prepareMarkAsDeleted).not.toHaveBeenCalled();
  });

  it('still removes a row the server dropped when nothing was written locally', async () => {
    const stale = windowRow('stale-uid');
    mockFetchForCalendars.mockResolvedValue(outcome([]));
    const { db, batch } = makeDb({ eventRows: [stale] });
    mockGetDb.mockReturnValue(db);

    await syncEvents(account, [calendar], start, end);

    expect(stale.prepareMarkAsDeleted).toHaveBeenCalled();
    expect(batch).toHaveBeenCalled();
  });

  it('applies remote changes when the local write happened before the fetch', async () => {
    markLocalWrite();
    const row = windowRow('old-edit-uid');
    mockFetchForCalendars.mockResolvedValue(outcome([{ ...evt('h1'), uid: 'old-edit-uid' }]));
    const { db, batch } = makeDb({ eventRows: [row] });
    mockGetDb.mockReturnValue(db);

    await syncEvents(account, [calendar], start, end);

    expect(batch).toHaveBeenCalled();
  });
});

describe('syncEvents — one failing calendar must not wipe the others', () => {
  const start = new Date('2026-07-01T00:00:00Z');
  const end = new Date('2026-08-01T00:00:00Z');

  const other: CalendarMeta = {
    ...calendar,
    id: 'https://cloud.example.com/remote.php/dav/calendars/john/shared/',
    url: 'https://cloud.example.com/remote.php/dav/calendars/john/shared/',
    displayName: 'Shared',
    slug: 'shared',
  };

  function rowIn(cal: CalendarMeta, uid: string) {
    return {
      uid,
      href: `h-${uid}`,
      accountId: account.id,
      calendarId: cal.id,
      summary: 'old',
      prepareMarkAsDeleted: jest.fn(() => ({ _op: 'del', uid })),
      prepareUpdate: jest.fn(() => ({ _op: 'upd', uid })),
    };
  }

  it('writes the events of the calendars that answered', async () => {
    mockFetchForCalendars.mockResolvedValue({
      events: [{ ...evt('h1'), uid: 'fresh-uid' }],
      syncedCalendarIds: [calendar.id],
      failures: [new Error('fetchEvents HTTP 403')],
    });
    const { db, batch, prepareCreate } = makeDb({ eventRows: [] });
    mockGetDb.mockReturnValue(db);

    await syncEvents(account, [calendar, other], start, end);

    expect(prepareCreate).toHaveBeenCalledTimes(1);
    expect(batch).toHaveBeenCalled();
  });

  it('keeps the stored rows of a calendar whose fetch failed', async () => {
    const kept = rowIn(other, 'other-uid');
    mockFetchForCalendars.mockResolvedValue({
      events: [],
      syncedCalendarIds: [calendar.id],
      failures: [new Error('fetchEvents HTTP 403')],
    });
    const { db } = makeDb({ eventRows: [kept] });
    mockGetDb.mockReturnValue(db);

    await syncEvents(account, [calendar, other], start, end);

    expect(kept.prepareMarkAsDeleted).not.toHaveBeenCalled();
  });

  it('still removes a stale row of a calendar that answered', async () => {
    const stale = rowIn(calendar, 'stale-uid');
    const kept = rowIn(other, 'other-uid');
    mockFetchForCalendars.mockResolvedValue({
      events: [],
      syncedCalendarIds: [calendar.id],
      failures: [new Error('fetchEvents HTTP 403')],
    });
    const { db } = makeDb({ eventRows: [stale, kept] });
    mockGetDb.mockReturnValue(db);

    await syncEvents(account, [calendar, other], start, end);

    expect(stale.prepareMarkAsDeleted).toHaveBeenCalled();
    expect(kept.prepareMarkAsDeleted).not.toHaveBeenCalled();
  });

  it('removes rows orphaned by a calendar that no longer exists', async () => {
    const orphan = rowIn(other, 'orphan-uid');
    mockFetchForCalendars.mockResolvedValue({
      events: [],
      syncedCalendarIds: [calendar.id],
      failures: [],
    });
    const { db } = makeDb({ eventRows: [orphan] });
    mockGetDb.mockReturnValue(db);

    await syncEvents(account, [calendar], start, end);

    expect(orphan.prepareMarkAsDeleted).toHaveBeenCalled();
  });

  it('throws and touches nothing when every calendar fetch failed', async () => {
    const kept = rowIn(calendar, 'keep-uid');
    mockFetchForCalendars.mockResolvedValue({
      events: [],
      syncedCalendarIds: [],
      failures: [new Error('Network request failed'), new Error('Network request failed')],
    });
    const { db, batch } = makeDb({ eventRows: [kept] });
    mockGetDb.mockReturnValue(db);

    await expect(syncEvents(account, [calendar, other], start, end)).rejects.toThrow(
      '2/2 calendar fetch(es) failed',
    );
    expect(kept.prepareMarkAsDeleted).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it('does nothing when there are no calendars to sync', async () => {
    const kept = rowIn(calendar, 'keep-uid');
    const { db, batch } = makeDb({ eventRows: [kept] });
    mockGetDb.mockReturnValue(db);

    await syncEvents(account, [], start, end);

    expect(mockFetchForCalendars).not.toHaveBeenCalled();
    expect(kept.prepareMarkAsDeleted).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });
});
