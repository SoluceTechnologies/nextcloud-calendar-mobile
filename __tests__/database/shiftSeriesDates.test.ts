import { shiftSeriesDates } from '../../src/database/eventWrites';
import { getDatabaseInstance } from '../../src/database/DatabaseProvider';

jest.mock('../../src/database/DatabaseProvider');
jest.mock('../../src/database/utils/safeTransaction', () => ({
  safeWrite: (_db: unknown, fn: () => Promise<unknown>) => fn(),
}));

const mockGetDb = getDatabaseInstance as jest.Mock;

const ACCOUNT_ID = 'acc-1';
const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

function makeRow(uid: string, start: number, end: number, summary = 's') {
  const row: any = { uid, accountId: ACCOUNT_ID, start, end, summary };
  row.prepareUpdate = jest.fn((updater: (r: any) => void) => {
    updater(row);
    return { _op: 'upd', uid };
  });
  return row;
}

function makeDb(eventRows: any[]) {
  const batch = jest.fn(async () => {});
  const eventsCol = {
    query: jest.fn(() => ({ fetch: jest.fn(async () => eventRows) })),
  };
  const db = {
    get: jest.fn((table: string) => (table === 'events' ? eventsCol : { query: jest.fn() })),
    write: jest.fn(async (fn: () => Promise<unknown>) => fn()),
    batch,
  };
  return { db, batch };
}

beforeEach(() => jest.clearAllMocks());

describe('shiftSeriesDates', () => {
  it('shifts every occurrence of the series by the deltas', async () => {
    const t0 = Date.UTC(2026, 7, 3, 9, 0, 0);
    const r1 = makeRow('base_occ_1', t0, t0 + HOUR);
    const r2 = makeRow('base_occ_2', t0 + HOUR, t0 + 2 * HOUR);
    const r3 = makeRow('base_occ_3', t0 + 2 * HOUR, t0 + 3 * HOUR);
    const { db, batch } = makeDb([r1, r2, r3]);
    mockGetDb.mockReturnValue(db);

    await shiftSeriesDates(ACCOUNT_ID, 'base', 30 * MIN, 30 * MIN, {});

    expect(r1.start).toBe(t0 + 30 * MIN);
    expect(r1.end).toBe(t0 + HOUR + 30 * MIN);
    expect(r2.start).toBe(t0 + HOUR + 30 * MIN);
    expect(r2.end).toBe(t0 + 2 * HOUR + 30 * MIN);
    expect(r3.start).toBe(t0 + 2 * HOUR + 30 * MIN);
    expect(r3.end).toBe(t0 + 3 * HOUR + 30 * MIN);

    expect(r2.start - r1.start).toBe(HOUR);
    expect(r3.start - r2.start).toBe(HOUR);

    expect(batch).toHaveBeenCalled();
  });

  it('shifts start and end independently, so a resize keeps its start', async () => {
    const t0 = Date.UTC(2026, 7, 3, 9, 0, 0);
    const r1 = makeRow('base_occ_1', t0, t0 + HOUR);
    const r2 = makeRow('base_occ_2', t0 + HOUR, t0 + 2 * HOUR);
    const { db } = makeDb([r1, r2]);
    mockGetDb.mockReturnValue(db);

    await shiftSeriesDates(ACCOUNT_ID, 'base', 0, 30 * MIN, {});

    expect(r1.start).toBe(t0);
    expect(r1.end).toBe(t0 + HOUR + 30 * MIN);
    expect(r2.start).toBe(t0 + HOUR);
    expect(r2.end).toBe(t0 + 2 * HOUR + 30 * MIN);
  });

  it('leaves a different series untouched', async () => {
    const t0 = Date.UTC(2026, 7, 3, 9, 0, 0);
    const r1 = makeRow('base_occ_1', t0, t0 + HOUR);
    const other = makeRow('other_occ_1', t0, t0 + HOUR);
    const { db } = makeDb([r1, other]);
    mockGetDb.mockReturnValue(db);

    await shiftSeriesDates(ACCOUNT_ID, 'base', 30 * MIN, 30 * MIN, {});

    expect(other.start).toBe(t0);
    expect(other.end).toBe(t0 + HOUR);
    expect(other.prepareUpdate).not.toHaveBeenCalled();
    expect(r1.start).toBe(t0 + 30 * MIN);
  });

  it('applies the non-temporal patch to every row of the series', async () => {
    const t0 = Date.UTC(2026, 7, 3, 9, 0, 0);
    const r1 = makeRow('base_occ_1', t0, t0 + HOUR, 'Old title');
    const r2 = makeRow('base_occ_2', t0 + HOUR, t0 + 2 * HOUR, 'Old title');
    const other = makeRow('other_occ_1', t0, t0 + HOUR, 'Old title');
    const { db } = makeDb([r1, r2, other]);
    mockGetDb.mockReturnValue(db);

    await shiftSeriesDates(ACCOUNT_ID, 'base', 0, 0, { summary: 'New title' });

    expect(r1.summary).toBe('New title');
    expect(r2.summary).toBe('New title');
    expect(other.summary).toBe('Old title');
  });

  it('does nothing when no row matches the base uid', async () => {
    const t0 = Date.UTC(2026, 7, 3, 9, 0, 0);
    const other = makeRow('other_occ_1', t0, t0 + HOUR);
    const { db, batch } = makeDb([other]);
    mockGetDb.mockReturnValue(db);

    await expect(shiftSeriesDates(ACCOUNT_ID, 'ghost', 30 * MIN, 30 * MIN, {})).resolves.toBeUndefined();

    expect(other.prepareUpdate).not.toHaveBeenCalled();
    expect(other.start).toBe(t0);
    expect(batch).toHaveBeenCalledWith([]);
  });
});
