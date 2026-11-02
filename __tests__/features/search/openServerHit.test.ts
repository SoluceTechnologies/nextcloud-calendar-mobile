import { Q } from '@nozbe/watermelondb';

import { openServerHit } from '@/features/search/openServerHit';
import type { ServerHit } from '@/features/search/serverSearch';
import { fetchEventIcs } from '@/services/nextcloud/caldav';
import { parseIcsObjectsAsync } from '@/utils/caldav-parse';
import { getDatabaseInstance } from '@/database/DatabaseProvider';
import { prepareCreateEvent } from '@/database/sync';
import type { Account, CalendarEvent, CalendarMeta } from '@/types';

jest.mock('@/services/nextcloud/caldav', () => ({ fetchEventIcs: jest.fn() }));
jest.mock('@/utils/caldav-parse', () => ({ parseIcsObjectsAsync: jest.fn() }));
jest.mock('@/database/DatabaseProvider', () => ({ getDatabaseInstance: jest.fn() }));
jest.mock('@/database/sync', () => ({ prepareCreateEvent: jest.fn(() => 'prepared-row') }));
jest.mock('@/database/utils/safeTransaction', () => ({
  safeWrite: (_database: unknown, operation: () => Promise<unknown>) => operation(),
}));

const DAY_MS = 86_400_000;
const start = new Date(2023, 10, 15, 9, 0);

const account: Account = {
  id: 'account-1',
  displayName: 'Work',
  baseUrl: 'https://cloud.test',
  username: 'alice',
  appPassword: 'secret',
  davUserId: 'alice',
};

const calendar: CalendarMeta = {
  id: 'personal',
  accountId: 'account-1',
  displayName: 'Personal',
  color: '#0082c9',
  ctag: '',
  url: 'https://cloud.test/remote.php/dav/calendars/alice/personal/',
  slug: 'personal',
};

const hit: ServerHit = {
  title: 'Old lunch',
  subline: 'Nov 15, 2023',
  start,
  href: 'https://cloud.test/remote.php/dav/calendars/alice/personal/lunch.ics',
  calendar,
};

const occurrence = (startMs: number): CalendarEvent => ({
  uid: `lunch_occ_${startMs / 1000}`,
  href: hit.href,
  calendarId: 'personal',
  accountId: 'account-1',
  summary: 'Old lunch',
  dtstart: new Date(startMs),
  dtend: new Date(startMs + DAY_MS / 24),
  allDay: false,
  color: '#0082c9',
  attendees: [],
  isRecurring: true,
});

const fetchIcs = fetchEventIcs as jest.Mock;
const parse = parseIcsObjectsAsync as jest.Mock;
const prepare = prepareCreateEvent as jest.Mock;
let existingRows: unknown[];
let collection: { query: jest.Mock };
let database: { get: jest.Mock; batch: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
  existingRows = [];
  collection = { query: jest.fn(() => ({ fetch: async () => existingRows })) };
  database = { get: jest.fn(() => collection), batch: jest.fn() };
  (getDatabaseInstance as jest.Mock).mockReturnValue(database);
  fetchIcs.mockResolvedValue('BEGIN:VCALENDAR…');
});

it('parses one day around the hit start, inserts the closest occurrence and returns its uid', async () => {
  const exact = occurrence(start.getTime());
  parse.mockResolvedValue([occurrence(start.getTime() - DAY_MS), exact, occurrence(start.getTime() + DAY_MS)]);

  await expect(openServerHit(account, hit)).resolves.toBe(exact.uid);

  expect(fetchIcs).toHaveBeenCalledWith(account, hit.href);
  expect(parse).toHaveBeenCalledWith(
    [{ ics: 'BEGIN:VCALENDAR…', href: hit.href }],
    { calendarId: 'personal', accountId: 'account-1', color: '#0082c9' },
    new Date(start.getTime() - DAY_MS),
    new Date(start.getTime() + DAY_MS),
  );
  expect(collection.query).toHaveBeenCalledWith(
    Q.where('account_id', 'account-1'),
    Q.where('calendar_id', 'personal'),
    Q.where('uid', exact.uid),
  );
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(prepare).toHaveBeenCalledWith(collection, exact);
  expect(database.batch).toHaveBeenCalledWith('prepared-row');
});

it('returns the existing uid without inserting when the row exists', async () => {
  const exact = occurrence(start.getTime());
  parse.mockResolvedValue([exact]);
  existingRows = [{ id: 'row-1' }];

  await expect(openServerHit(account, hit)).resolves.toBe(exact.uid);
  expect(prepare).not.toHaveBeenCalled();
  expect(database.batch).not.toHaveBeenCalled();
});

it('parses without a range when start is null', async () => {
  const master = occurrence(start.getTime());
  parse.mockResolvedValue([master]);

  await expect(openServerHit(account, { ...hit, start: null })).resolves.toBe(master.uid);
  expect(parse.mock.calls[0][2]).toBeUndefined();
  expect(parse.mock.calls[0][3]).toBeUndefined();
});

it('rejects when nothing parses', async () => {
  parse.mockResolvedValue([]);
  await expect(openServerHit(account, hit)).rejects.toThrow();
  expect(database.batch).not.toHaveBeenCalled();
});
