import { patchByUid } from '../../src/database/eventWrites';
import { getDatabaseInstance } from '../../src/database/DatabaseProvider';
import { serializeAlarms } from '../../src/database/sync';
import { mapEventToShared } from '../../src/database/mappers/event';

jest.mock('../../src/database/DatabaseProvider');
jest.mock('../../src/database/utils/safeTransaction', () => ({
  safeWrite: (_db: unknown, fn: () => Promise<unknown>) => fn(),
}));

const mockGetDb = getDatabaseInstance as jest.Mock;

const ACCOUNT_ID = 'acc-1';

function makeRow(uid: string) {
  const row: any = { uid, accountId: ACCOUNT_ID };
  row.prepareUpdate = jest.fn((updater: (r: any) => void) => {
    updater(row);
    return { _op: 'upd', uid };
  });
  return row;
}

function makeDb(eventRows: any[]) {
  const eventsCol = {
    query: jest.fn(() => ({ fetch: jest.fn(async () => eventRows) })),
  };
  return {
    get: jest.fn(() => eventsCol),
    write: jest.fn(async (fn: () => Promise<unknown>) => fn()),
    batch: jest.fn(async () => {}),
  };
}

beforeEach(() => jest.clearAllMocks());

describe('serializeAlarms', () => {
  it('keeps undefined as undefined', () => {
    expect(serializeAlarms(undefined)).toBeUndefined();
  });

  it('serializes an explicit empty list', () => {
    expect(serializeAlarms([])).toBe('[]');
  });

  it('deduplicates and sorts by lead time', () => {
    expect(serializeAlarms([15, 60, 15, 0])).toBe('[60,15,0]');
  });
});

describe('patchByUid alarms', () => {
  it('stores the JSON list and mirrors the first offset in alarm_minutes', async () => {
    const row = makeRow('u1');
    mockGetDb.mockReturnValue(makeDb([row]));

    await patchByUid(ACCOUNT_ID, 'u1', { alarms: [60, 0] });

    expect(row.alarms).toBe('[60,0]');
    expect(row.alarmMinutes).toBe(60);
  });

  it('stores an explicit empty list and clears alarm_minutes', async () => {
    const row = makeRow('u1');
    row.alarmMinutes = 15;
    mockGetDb.mockReturnValue(makeDb([row]));

    await patchByUid(ACCOUNT_ID, 'u1', { alarms: [] });

    expect(row.alarms).toBe('[]');
    expect(row.alarmMinutes).toBeUndefined();
  });

  it('clears both columns when alarms is undefined', async () => {
    const row = makeRow('u1');
    row.alarms = '[15]';
    row.alarmMinutes = 15;
    mockGetDb.mockReturnValue(makeDb([row]));

    await patchByUid(ACCOUNT_ID, 'u1', { alarms: undefined });

    expect(row.alarms).toBeUndefined();
    expect(row.alarmMinutes).toBeUndefined();
  });
});

describe('mapEventToShared alarms', () => {
  it('parses the JSON list', () => {
    const event = mapEventToShared({ alarms: '[60,15]' } as any);
    expect(event.alarms).toEqual([60, 15]);
  });

  it('keeps an explicit empty list distinct from undefined', () => {
    expect(mapEventToShared({ alarms: '[]' } as any).alarms).toEqual([]);
    expect(mapEventToShared({} as any).alarms).toBeUndefined();
  });

  it('falls back to the legacy alarm_minutes column', () => {
    const event = mapEventToShared({ alarmMinutes: 30 } as any);
    expect(event.alarms).toEqual([30]);
  });

  it('prefers the JSON column over the legacy one', () => {
    const event = mapEventToShared({ alarms: '[5]', alarmMinutes: 30 } as any);
    expect(event.alarms).toEqual([5]);
  });
});
