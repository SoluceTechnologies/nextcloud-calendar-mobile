import { findIdenticalEvent } from '../../src/database/eventWrites';
import { getDatabaseInstance } from '../../src/database/DatabaseProvider';

jest.mock('../../src/database/DatabaseProvider');
jest.mock('../../src/database/utils/safeTransaction', () => ({
  safeWrite: (_db: unknown, fn: () => Promise<unknown>) => fn(),
}));

const mockGetDb = getDatabaseInstance as jest.Mock;

const ACCOUNT_ID = 'acc-1';
const CAL_ID = 'https://nc/calendars/u/personal/';
const HOUR = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 8, 9, 0, 0);

function makeRow(over: Record<string, unknown>) {
  return {
    uid: 'uid-1',
    accountId: ACCOUNT_ID,
    calendarId: CAL_ID,
    summary: 'rdv multi',
    start: T0,
    end: T0 + HOUR,
    allDay: false,
    ...over,
  };
}

function makeDb(eventRows: object[]) {
  const eventsCol = {
    query: jest.fn(() => ({ fetch: jest.fn(async () => eventRows) })),
  };
  return {
    get: jest.fn((table: string) => (table === 'events' ? eventsCol : { query: jest.fn() })),
    write: jest.fn(async (fn: () => Promise<unknown>) => fn()),
    batch: jest.fn(async () => {}),
  };
}

const PROBE = {
  summary: 'rdv multi',
  dtstart: new Date(T0),
  dtend: new Date(T0 + HOUR),
  allDay: false,
};

beforeEach(() => jest.clearAllMocks());

describe('findIdenticalEvent', () => {
  it('finds the identical event in the same calendar', async () => {
    mockGetDb.mockReturnValue(makeDb([makeRow({})]));
    const found = await findIdenticalEvent(ACCOUNT_ID, CAL_ID, PROBE);
    expect(found?.uid).toBe('uid-1');
  });

  it('ignores events from another calendar', async () => {
    mockGetDb.mockReturnValue(makeDb([makeRow({})]));
    const found = await findIdenticalEvent(ACCOUNT_ID, 'https://nc/calendars/u/other/', PROBE);
    // the mocked query returns all rows, so scope is enforced by the caller's
    // calendar filter — simulate it by probing a calendar whose rows differ
    expect(found).toBeUndefined();
  });

  it('ignores a different summary', async () => {
    mockGetDb.mockReturnValue(makeDb([makeRow({})]));
    const found = await findIdenticalEvent(ACCOUNT_ID, CAL_ID, { ...PROBE, summary: 'autre' });
    expect(found).toBeUndefined();
  });

  it('ignores a different start', async () => {
    mockGetDb.mockReturnValue(makeDb([makeRow({})]));
    const found = await findIdenticalEvent(ACCOUNT_ID, CAL_ID, {
      ...PROBE,
      dtstart: new Date(T0 + 30 * 60 * 1000),
    });
    expect(found).toBeUndefined();
  });

  it('ignores a different end', async () => {
    mockGetDb.mockReturnValue(makeDb([makeRow({})]));
    const found = await findIdenticalEvent(ACCOUNT_ID, CAL_ID, {
      ...PROBE,
      dtend: new Date(T0 + 2 * HOUR),
    });
    expect(found).toBeUndefined();
  });

  it('ignores a different allDay flag', async () => {
    mockGetDb.mockReturnValue(makeDb([makeRow({})]));
    const found = await findIdenticalEvent(ACCOUNT_ID, CAL_ID, { ...PROBE, allDay: true });
    expect(found).toBeUndefined();
  });

  it('trims surrounding whitespace on the summary', async () => {
    mockGetDb.mockReturnValue(makeDb([makeRow({})]));
    const found = await findIdenticalEvent(ACCOUNT_ID, CAL_ID, { ...PROBE, summary: '  rdv multi  ' });
    expect(found?.uid).toBe('uid-1');
  });

  it('does not match the excluded base uid (own optimistic insert)', async () => {
    mockGetDb.mockReturnValue(makeDb([makeRow({ uid: 'new-uid' })]));
    const found = await findIdenticalEvent(ACCOUNT_ID, CAL_ID, PROBE, 'new-uid');
    expect(found).toBeUndefined();
  });

  it('excludes series rows sharing the base uid', async () => {
    mockGetDb.mockReturnValue(
      makeDb([makeRow({ uid: 'new-uid_occ_1' }), makeRow({ uid: 'new-uid_occ_2' })]),
    );
    const found = await findIdenticalEvent(ACCOUNT_ID, CAL_ID, PROBE, 'new-uid');
    expect(found).toBeUndefined();
  });

  it('still matches an identical event under another base uid', async () => {
    mockGetDb.mockReturnValue(
      makeDb([makeRow({ uid: 'new-uid' }), makeRow({ uid: 'prev-uid' })]),
    );
    const found = await findIdenticalEvent(ACCOUNT_ID, CAL_ID, PROBE, 'new-uid');
    expect(found?.uid).toBe('prev-uid');
  });
});
