import { DatabaseInitializer } from '../../src/database/utils/initialization';
import { getDatabaseInstance } from '../../src/database/DatabaseProvider';

jest.mock('../../src/database/DatabaseProvider');

const mockGetDb = getDatabaseInstance as jest.Mock;

function makeDb() {
  const fetchCount = jest.fn(async () => 0);
  const query = jest.fn(() => ({ fetchCount }));
  const events = { query };
  const write = jest.fn();
  const db = {
    collections: { get: jest.fn(() => events) },
    write,
  };
  return { db, fetchCount, query, write };
}

function resetSingleton() {
  (DatabaseInitializer as unknown as { instance?: DatabaseInitializer }).instance = undefined;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetSingleton();
});

describe('DatabaseInitializer', () => {
  it('probes the database without fetching rows or enqueueing writers', async () => {
    const { db, fetchCount, query, write } = makeDb();
    mockGetDb.mockReturnValue(db);

    const initializer = DatabaseInitializer.getInstance();
    await initializer.initializeDatabase();

    expect(query).toHaveBeenCalledTimes(1);
    expect(fetchCount).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
    expect(initializer.isReady()).toBe(true);
  });

  it('does not probe again once initialized', async () => {
    const { db, fetchCount } = makeDb();
    mockGetDb.mockReturnValue(db);

    const initializer = DatabaseInitializer.getInstance();
    await initializer.initializeDatabase();
    await initializer.initializeDatabase();

    expect(fetchCount).toHaveBeenCalledTimes(1);
  });

  it('propagates probe failures and allows a later retry', async () => {
    const { db, fetchCount } = makeDb();
    mockGetDb.mockReturnValue(db);
    fetchCount.mockRejectedValueOnce(new Error('sqlite unavailable'));

    const initializer = DatabaseInitializer.getInstance();
    await expect(initializer.initializeDatabase()).rejects.toThrow('sqlite unavailable');
    expect(initializer.isReady()).toBe(false);

    await initializer.initializeDatabase();
    expect(initializer.isReady()).toBe(true);
    expect(fetchCount).toHaveBeenCalledTimes(2);
  });
});
