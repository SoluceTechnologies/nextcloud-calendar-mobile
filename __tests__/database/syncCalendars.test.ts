import { syncCalendars } from '../../src/database/sync';
import { fetchCalendars } from '../../src/services/nextcloud/caldav';
import { getDatabaseInstance } from '../../src/database/DatabaseProvider';
import type { Account, CalendarMeta } from '../../src/types';

jest.mock('../../src/services/nextcloud/caldav');
jest.mock('../../src/database/DatabaseProvider');
jest.mock('../../src/database/utils/safeTransaction', () => ({
  safeWrite: (_db: unknown, fn: () => Promise<unknown>) => fn(),
}));

const mockFetchCalendars = fetchCalendars as jest.Mock;
const mockGetDb = getDatabaseInstance as jest.Mock;

const account: Account = {
  id: 'acc-1',
  displayName: 'Work',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'xxxx',
  davUserId: 'john',
};

function remoteCalendar(id: string): CalendarMeta {
  return {
    id,
    accountId: account.id,
    displayName: 'Cal',
    color: '#fff',
    ctag: '1',
    url: id,
    slug: id,
  };
}

function calendarRow(remoteId: string) {
  return {
    remoteId,
    accountId: account.id,
    displayName: 'Cal',
    color: '#fff',
    ctag: '1',
    url: remoteId,
    slug: remoteId,
    isSubscribed: false,
    isReadOnly: false,
    supportsEvents: true,
    sourceUrl: undefined,
    prepareMarkAsDeleted: jest.fn(() => ({ _op: 'del-cal', remoteId })),
    prepareUpdate: jest.fn(() => ({ _op: 'upd-cal', remoteId })),
  };
}

function eventRow(calendarId: string, href: string, color = '#fff') {
  const row = {
    calendarId,
    href,
    color,
    prepareMarkAsDeleted: jest.fn(() => ({ _op: 'del-ev', href })),
    prepareUpdate: jest.fn((fn: (r: { color: string }) => void) => {
      fn(row);
      return { _op: 'upd-ev', href };
    }),
  };
  return row;
}

function makeDb(opts: { calendarRows?: any[]; eventRows?: any[] }) {
  const calendarRows = opts.calendarRows ?? [];
  const eventRows = opts.eventRows ?? [];
  const batch = jest.fn(async (_ops: unknown[]) => {});
  const prepareCreate = jest.fn((fn: (r: unknown) => void) => ({ _op: 'create', fn }));
  const calendarsCol = {
    query: jest.fn(() => ({ fetch: jest.fn(async () => calendarRows) })),
    prepareCreate,
  };
  const eventsCol = {
    query: jest.fn(() => ({ fetch: jest.fn(async () => eventRows) })),
    prepareCreate,
  };
  const db = {
    get: jest.fn((table: string) => (table === 'events' ? eventsCol : calendarsCol)),
    batch,
  };
  return { db, batch, calendarsCol, eventsCol };
}

beforeEach(() => jest.clearAllMocks());

describe('syncCalendars', () => {
  it('marks a calendar missing from the server as deleted', async () => {
    const row = calendarRow('cal-gone');
    const { db, batch } = makeDb({ calendarRows: [row] });
    mockGetDb.mockReturnValue(db);
    mockFetchCalendars.mockResolvedValue([]);

    await syncCalendars(account);

    expect(row.prepareMarkAsDeleted).toHaveBeenCalledTimes(1);
    expect(batch).toHaveBeenCalledTimes(1);
  });

  it('purges events of a deleted calendar in the same batch', async () => {
    const row = calendarRow('cal-gone');
    const alive = calendarRow('cal-alive');
    const orphan1 = eventRow('cal-gone', 'h1');
    const orphan2 = eventRow('cal-gone', 'h2');
    const { db, batch } = makeDb({ calendarRows: [row, alive], eventRows: [orphan1, orphan2] });
    mockGetDb.mockReturnValue(db);
    mockFetchCalendars.mockResolvedValue([remoteCalendar('cal-alive')]);

    await syncCalendars(account);

    expect(orphan1.prepareMarkAsDeleted).toHaveBeenCalledTimes(1);
    expect(orphan2.prepareMarkAsDeleted).toHaveBeenCalledTimes(1);
    expect(batch).toHaveBeenCalledTimes(1);
    const ops = batch.mock.calls[0][0];
    expect(ops).toHaveLength(3);
  });

  it('does not touch events of calendars that still exist on the server', async () => {
    const row = calendarRow('cal-alive');
    const ev = eventRow('cal-alive', 'h1');
    const { db, batch } = makeDb({ calendarRows: [row], eventRows: [ev] });
    mockGetDb.mockReturnValue(db);
    mockFetchCalendars.mockResolvedValue([remoteCalendar('cal-alive')]);

    await syncCalendars(account);

    expect(row.prepareMarkAsDeleted).not.toHaveBeenCalled();
    expect(ev.prepareMarkAsDeleted).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it('does not rewrite events whose color already matches their calendar', async () => {
    const row = calendarRow('cal-alive');
    const ev = eventRow('cal-alive', 'h1');
    const { db, batch } = makeDb({ calendarRows: [row], eventRows: [ev] });
    mockGetDb.mockReturnValue(db);
    mockFetchCalendars.mockResolvedValue([remoteCalendar('cal-alive')]);

    await syncCalendars(account);

    expect(ev.prepareUpdate).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it('creates a row for a new remote calendar', async () => {
    const { db, calendarsCol } = makeDb({ calendarRows: [] });
    mockGetDb.mockReturnValue(db);
    mockFetchCalendars.mockResolvedValue([remoteCalendar('cal-new')]);

    await syncCalendars(account);

    expect(calendarsCol.prepareCreate).toHaveBeenCalledTimes(1);
  });

  it('updates a row when only the server calendar-order changed', async () => {
    const row = { ...calendarRow('cal-a'), calendarOrder: 0 };
    const { db, batch } = makeDb({ calendarRows: [row] });
    mockGetDb.mockReturnValue(db);
    mockFetchCalendars.mockResolvedValue([{ ...remoteCalendar('cal-a'), order: 2 }]);

    await syncCalendars(account);

    expect(row.prepareUpdate).toHaveBeenCalledTimes(1);
    expect(batch).toHaveBeenCalledTimes(1);
  });

  it('recolors cached events when the calendar color changed on the server', async () => {
    const row = calendarRow('cal-a');
    const ev1 = eventRow('cal-a', 'h1');
    const ev2 = eventRow('cal-a', 'h2');
    const { db, batch } = makeDb({ calendarRows: [row], eventRows: [ev1, ev2] });
    mockGetDb.mockReturnValue(db);
    mockFetchCalendars.mockResolvedValue([{ ...remoteCalendar('cal-a'), color: '#e53935' }]);

    await syncCalendars(account);

    expect(ev1.color).toBe('#e53935');
    expect(ev2.color).toBe('#e53935');
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(3);
  });

  it('heals events left stale even when the calendar row already has the new color', async () => {
    const row = { ...calendarRow('cal-a'), color: '#e53935' };
    const stale = eventRow('cal-a', 'h1', '#fff');
    const fresh = eventRow('cal-a', 'h2', '#e53935');
    const { db, batch } = makeDb({ calendarRows: [row], eventRows: [stale, fresh] });
    mockGetDb.mockReturnValue(db);
    mockFetchCalendars.mockResolvedValue([{ ...remoteCalendar('cal-a'), color: '#e53935' }]);

    await syncCalendars(account);

    expect(row.prepareUpdate).not.toHaveBeenCalled();
    expect(stale.color).toBe('#e53935');
    expect(fresh.prepareUpdate).not.toHaveBeenCalled();
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(1);
  });
});
