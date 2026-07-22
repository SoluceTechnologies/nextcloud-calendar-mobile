import { syncCalendarDelta } from '../../src/database/sync';
import { syncCollection, fetchEventsByHrefs } from '../../src/services/nextcloud/caldav';
import { getDatabaseInstance } from '../../src/database/DatabaseProvider';
import type { Account, CalendarMeta, CalendarEvent } from '../../src/types';

jest.mock('../../src/services/nextcloud/caldav');
jest.mock('../../src/database/DatabaseProvider');
// Passthrough so the real safeWrite's 30s watchdog timer doesn't leak as an
// open handle; the fake db.write already runs the operation.
jest.mock('../../src/database/utils/safeTransaction', () => ({
  safeWrite: (_db: unknown, fn: () => Promise<unknown>) => fn(),
}));

const mockSyncCollection = syncCollection as jest.Mock;
const mockFetchByHrefs = fetchEventsByHrefs as jest.Mock;
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
    mockFetchByHrefs.mockResolvedValue([]); // parse/fetch failure
    const existing = [makeRow('h1'), makeRow('h2')];
    const { db, batch } = makeDb({ calendarRow: noTokenRow(), eventRows: existing });
    mockGetDb.mockReturnValue(db);

    await syncCalendarDelta(account, calendar);

    expect(batch).not.toHaveBeenCalled();
    existing.forEach((r) => expect(r.prepareMarkAsDeleted).not.toHaveBeenCalled());
  });

  it('does NOT delete existing rows when a full sync enumerates zero members (untrusted empty)', async () => {
    mockSyncCollection.mockResolvedValue({ changed: [], deleted: [], newToken: 't2', reset: false });
    mockFetchByHrefs.mockResolvedValue([]);
    const existing = [makeRow('h1')];
    const { db, batch } = makeDb({ calendarRow: noTokenRow(), eventRows: existing });
    mockGetDb.mockReturnValue(db);

    await syncCalendarDelta(account, calendar);

    expect(existing[0].prepareMarkAsDeleted).not.toHaveBeenCalled();
    expect(batch).toHaveBeenCalled(); // token refresh op only
  });

  it('full sync reconcile: replaces fetched hrefs and removes stale ones', async () => {
    mockSyncCollection.mockResolvedValue({ changed: ['h1', 'h2'], deleted: [], newToken: 't2', reset: false });
    mockFetchByHrefs.mockResolvedValue([evt('h1'), evt('h2')]);
    const h1old = makeRow('h1');
    const h3stale = makeRow('h3'); // not enumerated → stale
    const { db, batch, prepareCreate } = makeDb({ calendarRow: noTokenRow(), eventRows: [h1old, h3stale] });
    mockGetDb.mockReturnValue(db);

    await syncCalendarDelta(account, calendar);

    expect(h1old.prepareMarkAsDeleted).toHaveBeenCalled(); // replaced
    expect(h3stale.prepareMarkAsDeleted).toHaveBeenCalled(); // stale removed
    expect(prepareCreate).toHaveBeenCalledTimes(2); // both fetched inserted
    expect(batch).toHaveBeenCalled();
  });

  it('incremental: deletes explicit removals + replaces fetched, leaves untouched hrefs intact', async () => {
    mockSyncCollection.mockResolvedValue({ changed: ['h1'], deleted: ['h2'], newToken: 't3', reset: false });
    mockFetchByHrefs.mockResolvedValue([evt('h1')]);
    const h1old = makeRow('h1');
    const h2gone = makeRow('h2');
    const h9other = makeRow('h9'); // not in changed/deleted → must survive
    const { db, prepareCreate } = makeDb({ calendarRow: tokenRow(), eventRows: [h1old, h2gone, h9other] });
    mockGetDb.mockReturnValue(db);

    await syncCalendarDelta(account, calendar);

    expect(h1old.prepareMarkAsDeleted).toHaveBeenCalled(); // replaced
    expect(h2gone.prepareMarkAsDeleted).toHaveBeenCalled(); // explicit delete
    expect(h9other.prepareMarkAsDeleted).not.toHaveBeenCalled(); // untouched
    expect(prepareCreate).toHaveBeenCalledTimes(1);
  });
});
