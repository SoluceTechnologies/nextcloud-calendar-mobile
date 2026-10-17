import { Alert } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';

import { useUpdateEvent } from '../../../src/features/event/hooks/useMutateEvent';
import { fetchEventIcsWithEtag, putEvent, updateEvent } from '../../../src/services/nextcloud/caldav';
import { deleteRemoteFile, uploadAttachmentFile } from '../../../src/services/nextcloud/files';
import { syncCalendarDelta } from '../../../src/database/sync';
import i18n from '../../../src/utils/i18n';
import type { Account, CalendarEvent, CalendarMeta, CreateEventInput } from '../../../src/types';

jest.mock('../../../src/services/nextcloud/caldav', () => ({
  fetchEventIcsWithEtag: jest.fn(),
  putEvent: jest.fn(async () => undefined),
  updateEvent: jest.fn(async () => undefined),
  deleteEvent: jest.fn(async () => undefined),
  moveEvent: jest.fn(async () => undefined),
}));

jest.mock('../../../src/services/nextcloud/files', () => ({
  uploadAttachmentFile: jest.fn(),
  deleteRemoteFile: jest.fn(async () => undefined),
}));

jest.mock('../../../src/services/nextcloud/talk', () => ({
  createTalkRoom: jest.fn(),
}));

jest.mock('../../../src/database/sync', () => ({
  syncCalendarDelta: jest.fn(async () => undefined),
  seriesBaseUid: (uid: string) => uid.split('_occ_')[0],
}));

jest.mock('../../../src/database/eventWrites', () => ({
  insertEvents: jest.fn(async () => undefined),
  patchByUid: jest.fn(async () => undefined),
  removeWhere: jest.fn(async () => []),
  restoreSeries: jest.fn(async () => undefined),
  snapshotByBase: jest.fn(async () => []),
  seriesBaseUid: (uid: string) => uid.split('_occ_')[0],
  shiftSeriesDates: jest.fn(async () => undefined),
}));

jest.mock('../../../src/stores/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ timedAlerts: [], allDayAlerts: [] }) },
}));

jest.mock('../../../src/features/notifications/alerts', () => ({
  NO_ALARM_PROP: 'X-NCM-ALARM-NONE',
  triggerToMinutes: jest.fn(() => undefined),
  allDayAlarmMinutes: (m: number) => m,
}));

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'new-uuid') }));

const mockFetchIcs = fetchEventIcsWithEtag as jest.Mock;
const mockUpdate = updateEvent as jest.Mock;
const mockPut = putEvent as jest.Mock;
const mockUpload = uploadAttachmentFile as jest.Mock;
const mockDelete = deleteRemoteFile as jest.Mock;

const account = {
  id: 'acc-1',
  baseUrl: 'https://srv',
  davUserId: 'alice',
  username: 'alice',
  appPassword: 'pw',
} as Account;

const calendar = {
  id: 'cal-1',
  url: 'https://srv/remote.php/dav/calendars/alice/personal/',
  color: '#fff',
} as CalendarMeta;

const occurrence: CalendarEvent = {
  uid: 'ev-1_occ_1789903200',
  href: 'https://srv/remote.php/dav/calendars/alice/personal/ev-1.ics',
  calendarId: 'cal-1',
  accountId: 'acc-1',
  summary: 'Weekly',
  dtstart: new Date('2026-09-21T14:00:00Z'),
  dtend: new Date('2026-09-21T15:00:00Z'),
  recurrenceId: new Date('2026-09-21T14:00:00Z'),
  allDay: false,
  isRecurring: true,
  rrule: 'RRULE:FREQ=WEEKLY',
  attendees: [],
  color: '#fff',
} as CalendarEvent;

const masterIcs = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:ev-1',
  'DTSTART;TZID=UTC:20260914T140000',
  'DTEND;TZID=UTC:20260914T150000',
  'RRULE:FREQ=WEEKLY',
  'SEQUENCE:3',
  'SUMMARY:Weekly',
  'ATTACH;FILENAME=old.pdf:https://srv/remote.php/dav/files/alice/Calendar/old.pdf',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

const input: CreateEventInput = {
  summary: 'Weekly (moved)',
  calendarId: 'cal-1',
  dtstart: new Date('2026-09-21T16:00:00Z'),
  dtend: new Date('2026-09-21T17:00:00Z'),
  allDay: false,
  organizerEmail: 'a@b.c',
  organizerName: 'A',
  attendees: [],
  alarms: [],
  withTalkRoom: false,
  removedAttachments: [
    { uri: 'https://srv/remote.php/dav/files/alice/Calendar/old.pdf', filename: 'old.pdf' },
  ],
  pendingAttachments: [{ name: 'new.txt', contentBase64: 'aGk=', mimeType: 'text/plain' }],
};

describe('useUpdateEvent — attachment delta on scope "this"', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await i18n.changeLanguage('en');
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockFetchIcs.mockResolvedValue({ ics: masterIcs, etag: '"e3"' });
    mockUpload.mockResolvedValue({
      davUrl: 'https://srv/remote.php/dav/files/alice/Calendar/new.txt',
      filename: 'new.txt',
      path: '/Calendar/new.txt',
    });
  });

  it('applies the delta to the master, not to the exception VEVENT', async () => {
    const { result } = renderHook(() => useUpdateEvent(account, [calendar]));

    await act(async () => {
      await result.current.mutateAsync({ event: occurrence, input, scope: 'this' });
    });

    // Master: EXDATE added, old.pdf stripped, new.txt attached.
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const [, href, ics, etag] = mockUpdate.mock.calls[0];
    expect(href).toBe(occurrence.href);
    expect(etag).toBe('"e3"');
    expect(ics).toContain('EXDATE');
    expect(ics).toContain('new.txt');
    expect(ics).not.toContain('old.pdf');

    // Exception: created with RECURRENCE-ID, no ATTACH copy (it inherits the
    // master's attachments at parse time).
    expect(mockPut).toHaveBeenCalledTimes(1);
    const exIcs = mockPut.mock.calls[0][3] as string;
    expect(exIcs).toContain('RECURRENCE-ID');
    expect(exIcs).not.toContain('ATTACH');
    expect(exIcs).not.toContain('EXDATE');
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('deletes the orphaned upload when the master update fails', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('HTTP 412'));
    const { result } = renderHook(() => useUpdateEvent(account, [calendar]));

    await act(async () => {
      await result.current.mutateAsync({ event: occurrence, input, scope: 'this' });
    });

    expect(mockDelete).toHaveBeenCalledWith(account, '/Calendar/new.txt');
    expect(mockPut).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalled();
  });
});
