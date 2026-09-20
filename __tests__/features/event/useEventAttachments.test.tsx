import { Alert } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';

import { useEventAttachments } from '../../../src/features/event/hooks/useEventAttachments';
import { fetchEventIcsWithEtag, updateEvent } from '../../../src/services/nextcloud/caldav';
import { deleteRemoteFile, uploadAttachmentFile } from '../../../src/services/nextcloud/files';
import { syncCalendarDelta } from '../../../src/database/sync';
import i18n from '../../../src/utils/i18n';
import type { Account, CalendarEvent, CalendarMeta } from '../../../src/types';

jest.mock('../../../src/services/nextcloud/caldav', () => ({
  fetchEventIcsWithEtag: jest.fn(),
  updateEvent: jest.fn(async () => undefined),
}));

jest.mock('../../../src/services/nextcloud/files', () => ({
  uploadAttachmentFile: jest.fn(),
  deleteRemoteFile: jest.fn(async () => undefined),
  ownDavPath: (_a: unknown, url: string) => {
    const root = 'https://srv/remote.php/dav/files/alice';
    return url.startsWith(root + '/') ? decodeURIComponent(url.slice(root.length)) : null;
  },
  isOwnDavFile: () => true,
}));

jest.mock('../../../src/database/sync', () => ({
  syncCalendarDelta: jest.fn(async () => undefined),
}));

const mockFetchIcs = fetchEventIcsWithEtag as jest.Mock;
const mockUpdate = updateEvent as jest.Mock;
const mockUpload = uploadAttachmentFile as jest.Mock;
const mockDelete = deleteRemoteFile as jest.Mock;
const mockSync = syncCalendarDelta as jest.Mock;

const account = {
  id: 'acc-1',
  baseUrl: 'https://srv',
  davUserId: 'alice',
  username: 'alice',
  appPassword: 'pw',
} as Account;

const calendar = { id: 'cal-1', isReadOnly: false, isSubscribed: false } as CalendarMeta;
const event = {
  uid: 'ev-1',
  href: 'https://srv/remote.php/dav/calendars/alice/personal/ev-1.ics',
  isTask: false,
} as CalendarEvent;

const baseIcs = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:ev-1',
  'DTSTART:20260919T140000Z',
  'DTEND:20260919T150000Z',
  'ATTACH;FILENAME=doc.pdf:https://srv/remote.php/dav/files/alice/Calendar/doc.pdf',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

function hook() {
  return renderHook(() => useEventAttachments(account, event, calendar));
}

describe('useEventAttachments', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await i18n.changeLanguage('en');
  });

  it('is not ready on a read-only calendar', () => {
    const { result } = renderHook(() =>
      useEventAttachments(account, event, { ...calendar, isReadOnly: true }),
    );
    expect(result.current.ready).toBe(false);
  });

  it('add uploads the file, injects ATTACH and PUTs with the etag', async () => {
    mockUpload.mockResolvedValue({
      davUrl: 'https://srv/remote.php/dav/files/alice/Calendar/new.txt',
      filename: 'new.txt',
      path: '/Calendar/new.txt',
    });
    mockFetchIcs.mockResolvedValue({ ics: baseIcs, etag: '"etag-1"' });
    const { result } = hook();

    await act(async () => {
      await result.current.add({ name: 'new.txt', contentBase64: 'aGk=', mimeType: 'text/plain' });
    });

    expect(mockUpdate).toHaveBeenCalledWith(
      account,
      event.href,
      expect.stringContaining('ATTACH;FMTTYPE=text/plain;FILENAME=new.txt'),
      '"etag-1"',
    );
    expect(mockSync).toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('deletes the orphaned upload when the event update fails', async () => {
    mockUpload.mockResolvedValue({
      davUrl: 'https://srv/remote.php/dav/files/alice/Calendar/new.txt',
      filename: 'new.txt',
      path: '/Calendar/new.txt',
    });
    mockFetchIcs.mockResolvedValue({ ics: baseIcs, etag: '"e"' });
    mockUpdate.mockRejectedValueOnce(new Error('HTTP 412'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { result } = hook();

    await act(async () => {
      await result.current.add({ name: 'new.txt', contentBase64: 'aGk=' });
    });

    expect(mockDelete).toHaveBeenCalledWith(account, '/Calendar/new.txt');
    expect(alertSpy).toHaveBeenCalled();
  });

  it('remove unlinks a matching ATTACH and can delete the remote file', async () => {
    mockFetchIcs.mockResolvedValue({ ics: baseIcs, etag: '"e"' });
    const { result } = hook();

    await act(async () => {
      await result.current.remove(
        { uri: 'https://srv/remote.php/dav/files/alice/Calendar/doc.pdf', filename: 'doc.pdf' },
        { deleteFile: true },
      );
    });

    expect(mockUpdate).toHaveBeenCalledWith(
      account,
      event.href,
      expect.not.stringContaining('ATTACH'),
      '"e"',
    );
    expect(mockDelete).toHaveBeenCalledWith(account, '/Calendar/doc.pdf');
  });

  it('remove with no matching ATTACH line skips the PUT and never deletes the file', async () => {
    mockFetchIcs.mockResolvedValue({ ics: baseIcs, etag: '"e"' });
    const { result } = hook();

    await act(async () => {
      await result.current.remove(
        { uri: 'https://srv/remote.php/dav/files/alice/Calendar/other.pdf', filename: 'other.pdf' },
        { deleteFile: true },
      );
    });

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockSync).toHaveBeenCalled();
  });
});
