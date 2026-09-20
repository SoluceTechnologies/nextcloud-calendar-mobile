import { Alert } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';

import { useEventAttachments } from '../../../src/features/event/hooks/useEventAttachments';
import { fetchEventIcsWithEtag, updateEvent } from '../../../src/services/nextcloud/caldav';
import { deleteRemoteFile, uploadAttachmentFile } from '../../../src/services/nextcloud/files';
import { resolveInternalFile } from '../../../src/services/nextcloud/fileLinks';
import { createPublicLinkShare, findShareByToken, deleteShare } from '../../../src/services/nextcloud/shares';
import { askAttachmentShareMode } from '../../../src/features/event/utils/attachments';
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

jest.mock('../../../src/services/nextcloud/fileLinks', () => ({
  ...jest.requireActual('../../../src/services/nextcloud/fileLinks'),
  resolveInternalFile: jest.fn(),
}));

jest.mock('../../../src/database/sync', () => ({
  syncCalendarDelta: jest.fn(async () => undefined),
}));

jest.mock('../../../src/services/nextcloud/shares', () => ({
  createPublicLinkShare: jest.fn(),
  findShareByToken: jest.fn(),
  deleteShare: jest.fn(async () => undefined),
}));

jest.mock('../../../src/features/event/utils/attachments', () => ({
  askAttachmentShareMode: jest.fn(async () => 'private'),
}));

const mockFetchIcs = fetchEventIcsWithEtag as jest.Mock;
const mockUpdate = updateEvent as jest.Mock;
const mockUpload = uploadAttachmentFile as jest.Mock;
const mockDelete = deleteRemoteFile as jest.Mock;
const mockResolve = resolveInternalFile as jest.Mock;
const mockShare = createPublicLinkShare as jest.Mock;
const mockFindShare = findShareByToken as jest.Mock;
const mockDeleteShare = deleteShare as jest.Mock;
const mockAskShare = askAttachmentShareMode as jest.Mock;
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

const eventWithAttendees = {
  ...event,
  attendees: [{ email: 'bob@example.com' }],
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

  it('does not ask about sharing when the event has no attendees', async () => {
    mockUpload.mockResolvedValue({
      davUrl: 'https://srv/remote.php/dav/files/alice/Calendar/new.txt',
      filename: 'new.txt',
      path: '/Calendar/new.txt',
    });
    mockFetchIcs.mockResolvedValue({ ics: baseIcs, etag: '"e"' });
    const { result } = hook();
    await act(async () => {
      await result.current.add({ name: 'new.txt', contentBase64: 'aGk=' });
    });
    expect(mockAskShare).not.toHaveBeenCalled();
    expect(mockShare).not.toHaveBeenCalled();
  });

  it('writes a public /s/ link when the user shares with attendees', async () => {
    mockUpload.mockResolvedValue({
      davUrl: 'https://srv/remote.php/dav/files/alice/Calendar/new.txt',
      filename: 'new.txt',
      path: '/Calendar/new.txt',
    });
    mockShare.mockResolvedValue({ url: 'https://srv/s/Tok123', token: 'Tok123', id: 7 });
    mockAskShare.mockResolvedValueOnce('public');
    mockFetchIcs.mockResolvedValue({ ics: baseIcs, etag: '"e"' });
    const { result } = renderHook(() =>
      useEventAttachments(account, eventWithAttendees, calendar),
    );

    await act(async () => {
      await result.current.add({ name: 'new.txt', contentBase64: 'aGk=', mimeType: 'text/plain' });
    });

    expect(mockShare).toHaveBeenCalledWith(account, '/Calendar/new.txt');
    const sent = (mockUpdate.mock.calls[0][2] as string).replace(/\r\n[ \t]/g, '');
    expect(sent).toContain('ATTACH;FMTTYPE=text/plain;FILENAME=new.txt:https://srv/s/Tok123');
  });

  it('keeps the private DAV url when the user declines public sharing', async () => {
    mockUpload.mockResolvedValue({
      davUrl: 'https://srv/remote.php/dav/files/alice/Calendar/new.txt',
      filename: 'new.txt',
      path: '/Calendar/new.txt',
    });
    mockAskShare.mockResolvedValueOnce('private');
    mockFetchIcs.mockResolvedValue({ ics: baseIcs, etag: '"e"' });
    const { result } = renderHook(() =>
      useEventAttachments(account, eventWithAttendees, calendar),
    );

    await act(async () => {
      await result.current.add({ name: 'new.txt', contentBase64: 'aGk=', mimeType: 'text/plain' });
    });

    expect(mockShare).not.toHaveBeenCalled();
    const sent = (mockUpdate.mock.calls[0][2] as string).replace(/\r\n[ \t]/g, '');
    expect(sent).toContain(
      'ATTACH;FMTTYPE=text/plain;FILENAME=new.txt:https://srv/remote.php/dav/files/alice/Calendar/new.txt',
    );
  });

  it('aborts the add when the share prompt is cancelled', async () => {
    mockAskShare.mockResolvedValueOnce(null);
    const { result } = renderHook(() =>
      useEventAttachments(account, eventWithAttendees, calendar),
    );

    await act(async () => {
      await result.current.add({ name: 'new.txt', contentBase64: 'aGk=' });
    });

    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('addRemote shares the picked file publicly when asked', async () => {
    mockShare.mockResolvedValue({ url: 'https://srv/s/Tok999', token: 'Tok999', id: 9 });
    mockAskShare.mockResolvedValueOnce('public');
    mockFetchIcs.mockResolvedValue({ ics: baseIcs, etag: '"e"' });
    const { result } = renderHook(() =>
      useEventAttachments(account, eventWithAttendees, calendar),
    );

    await act(async () => {
      await result.current.addRemote({
        uri: 'https://srv/remote.php/dav/files/alice/Docs/notes.md',
        filename: 'notes.md',
        fmttype: 'text/markdown',
      });
    });

    expect(mockShare).toHaveBeenCalledWith(account, '/Docs/notes.md');
    const sent = (mockUpdate.mock.calls[0][2] as string).replace(/\r\n[ \t]/g, '');
    expect(sent).toContain('ATTACH;FMTTYPE=text/markdown;FILENAME=notes.md:https://srv/s/Tok999');
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

  it('addRemote injects the DAV URI without uploading anything', async () => {
    mockFetchIcs.mockResolvedValue({ ics: baseIcs, etag: '"etag-9"' });
    const { result } = hook();

    await act(async () => {
      await result.current.addRemote({
        uri: 'https://srv/remote.php/dav/files/alice/Docs/notes.md',
        filename: 'notes.md',
        fmttype: 'text/markdown',
      });
    });

    expect(mockUpload).not.toHaveBeenCalled();
    // ATTACH lines fold at 75 chars — unfold before matching the full URI.
    expect(mockUpdate).toHaveBeenCalledWith(
      account,
      event.href,
      expect.any(String),
      '"etag-9"',
    );
    const sent = (mockUpdate.mock.calls[0][2] as string).replace(/\r\n[ \t]/g, '');
    expect(sent).toContain(
      'ATTACH;FMTTYPE=text/markdown;FILENAME=notes.md:https://srv/remote.php/dav/files/alice/Docs/notes.md',
    );
    expect(mockSync).toHaveBeenCalled();
  });

  it('remove with deleteFile resolves a /f/<id> link before deleting', async () => {
    const icsWithF = baseIcs.replace(
      'END:VEVENT',
      'ATTACH;FILENAME=pickme.txt:https://srv/f/326\r\nEND:VEVENT',
    );
    mockFetchIcs.mockResolvedValue({ ics: icsWithF, etag: '"e"' });
    mockResolve.mockResolvedValue({
      davUrl: 'https://srv/remote.php/dav/files/alice/Calendar/pickme.txt',
      path: '/Calendar/pickme.txt',
    });
    const { result } = hook();

    await act(async () => {
      await result.current.remove(
        { uri: 'https://srv/f/326', filename: 'pickme.txt' },
        { deleteFile: true },
      );
    });

    expect(mockResolve).toHaveBeenCalledWith(account, 326);
    expect(mockDelete).toHaveBeenCalledWith(account, '/Calendar/pickme.txt');
  });

  it('a failing /f/ resolution alerts instead of crashing the remove', async () => {
    const icsWithF = baseIcs.replace(
      'END:VEVENT',
      'ATTACH;FILENAME=pickme.txt:https://srv/f/326\r\nEND:VEVENT',
    );
    mockFetchIcs.mockResolvedValue({ ics: icsWithF, etag: '"e"' });
    mockResolve.mockRejectedValue(new Error('Network request failed'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { result } = hook();

    await act(async () => {
      await result.current.remove(
        { uri: 'https://srv/f/326', filename: 'pickme.txt' },
        { deleteFile: true },
      );
    });

    // The unlink still succeeded — only the delete alert fires.
    expect(alertSpy).toHaveBeenCalledWith(
      'Attachment removed, but the file could not be deleted',
    );
    expect(mockDelete).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('remove with revokeShare revokes the /s/ link but keeps the file', async () => {
    const icsWithS = baseIcs.replace(
      'END:VEVENT',
      'ATTACH;FILENAME=demo.txt:https://srv/s/Tok123\r\nEND:VEVENT',
    );
    mockFetchIcs.mockResolvedValue({ ics: icsWithS, etag: '"e"' });
    mockFindShare.mockResolvedValue({ id: 12, path: '/Calendar/demo.txt' });
    const { result } = hook();

    await act(async () => {
      await result.current.remove(
        { uri: 'https://srv/s/Tok123', filename: 'demo.txt' },
        { revokeShare: true },
      );
    });

    expect(mockFindShare).toHaveBeenCalledWith(account, 'Tok123');
    expect(mockDeleteShare).toHaveBeenCalledWith(account, 12);
    expect(mockDelete).not.toHaveBeenCalled();
    const sent = mockUpdate.mock.calls[0][2] as string;
    expect(sent).not.toContain('demo.txt');
  });

  it('does not revoke the share when the unlink did not happen', async () => {
    // ICS without the attachment — removeAttachLine matches nothing.
    mockFetchIcs.mockResolvedValue({ ics: baseIcs, etag: '"e"' });
    const { result } = hook();

    await act(async () => {
      await result.current.remove(
        { uri: 'https://srv/s/Tok123', filename: 'absent.txt' },
        { revokeShare: true },
      );
    });

    expect(mockFindShare).not.toHaveBeenCalled();
    expect(mockDeleteShare).not.toHaveBeenCalled();
  });
});
