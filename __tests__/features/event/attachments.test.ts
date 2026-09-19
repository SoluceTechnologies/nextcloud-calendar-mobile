import { Alert, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  attachmentDisplayName,
  attachmentIcon,
  formatBytes,
  isOpenableAttachment,
  openAttachment,
} from '../../../src/features/event/utils/attachments';
import { trustedFetch } from '../../../src/services/shared/trustedFetch';
import { fetchEventIcs } from '../../../src/services/nextcloud/caldav';
import type { Account, EventAttachment } from '../../../src/types';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  readDirectoryAsync: jest.fn(() => Promise.resolve([])),
  deleteAsync: jest.fn(() => Promise.resolve()),
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../../src/services/shared/trustedFetch', () => ({
  trustedFetch: jest.fn(),
}));

jest.mock('../../../src/services/nextcloud/caldav', () => ({
  fetchEventIcs: jest.fn(),
}));

const mockedFetch = trustedFetch as jest.MockedFunction<typeof trustedFetch>;
const mockedFetchIcs = fetchEventIcs as jest.MockedFunction<typeof fetchEventIcs>;
const mockedWrite = FileSystem.writeAsStringAsync as jest.Mock;
const mockedShare = Sharing.shareAsync as jest.Mock;

function account(partial: Partial<Account> = {}): Account {
  return {
    id: 'acc-1',
    displayName: 'Alice',
    baseUrl: 'https://cloud.example.com',
    username: 'alice',
    appPassword: 'pw',
    davUserId: 'alice',
    ...partial,
  };
}

function fetchOk(base64 = 'aGVsbG8=') {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    base64: () => Promise.resolve(base64),
  } as unknown as Awaited<ReturnType<typeof trustedFetch>>;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('formatBytes', () => {
  it('formats bytes, KB and MB', () => {
    expect(formatBytes(35)).toBe('35 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(20 * 1024 * 1024)).toBe('20 MB');
  });

  it('returns undefined for missing or non-positive sizes', () => {
    expect(formatBytes(undefined)).toBeUndefined();
    expect(formatBytes(0)).toBeUndefined();
    expect(formatBytes(-5)).toBeUndefined();
  });
});

describe('attachmentDisplayName', () => {
  it('uses the filename when present', () => {
    expect(attachmentDisplayName({ filename: 'doc.pdf' })).toBe('doc.pdf');
  });

  it('falls back to the translated untitled label', () => {
    expect(attachmentDisplayName({})).toBe('Attachment');
  });
});

describe('attachmentIcon', () => {
  it('picks icons from the MIME type', () => {
    expect(attachmentIcon({ fmttype: 'application/pdf' }).displayName).toContain('FileText');
    expect(attachmentIcon({ fmttype: 'image/png' }).displayName).toContain('FileImage');
    expect(
      attachmentIcon({ fmttype: 'application/vnd.ms-excel' }).displayName
    ).toContain('FileSpreadsheet');
    expect(attachmentIcon({ fmttype: 'application/zip' }).displayName).toContain('FileArchive');
  });

  it('falls back to the extension then to a generic file icon', () => {
    expect(attachmentIcon({ filename: 'a.csv' }).displayName).toContain('FileSpreadsheet');
    expect(attachmentIcon({ fmttype: 'application/x-custom' }).displayName).toBe('File');
    expect(attachmentIcon({}).displayName).toBe('Paperclip');
  });
});

describe('isOpenableAttachment', () => {
  it('accepts base64 content, stripped inline attachments and http(s) URIs', () => {
    expect(isOpenableAttachment({ base64: 'aGk=' })).toBe(true);
    expect(isOpenableAttachment({ inline: true, filename: 'a.pdf' })).toBe(true);
    expect(isOpenableAttachment({ uri: 'https://x.tld/f.pdf' })).toBe(true);
  });

  it('rejects non-http URIs and empty attachments', () => {
    expect(isOpenableAttachment({ uri: 'webcal://x.tld/a.ics' })).toBe(false);
    expect(isOpenableAttachment({ uri: 'cid:part1' })).toBe(false);
    expect(isOpenableAttachment({})).toBe(false);
  });
});

describe('openAttachment', () => {
  it('decodes a base64 attachment to cache and shares it', async () => {
    const att: EventAttachment = {
      base64: 'aGVsbG8=',
      filename: 'note.txt',
      fmttype: 'text/plain',
    };
    await openAttachment(att, account());
    expect(mockedWrite).toHaveBeenCalledWith(
      expect.stringContaining('note.txt'),
      'aGVsbG8=',
      { encoding: 'base64' }
    );
    expect(mockedShare).toHaveBeenCalledWith(
      expect.stringContaining('note.txt'),
      { mimeType: 'text/plain', dialogTitle: 'note.txt' }
    );
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('rejects a base64 attachment above the size limit', async () => {
    const att: EventAttachment = { base64: 'xx', size: 11 * 1024 * 1024 };
    await openAttachment(att, account());
    expect(Alert.alert).toHaveBeenCalledWith(
      'This attachment is too large to open'
    );
    expect(mockedShare).not.toHaveBeenCalled();
  });

  it('downloads a same-host URI with the account credentials and shares it', async () => {
    mockedFetch.mockResolvedValue(fetchOk());
    const att: EventAttachment = {
      uri: 'https://cloud.example.com/remote.php/dav/files/alice/doc.txt',
      filename: 'doc.txt',
      fmttype: 'text/plain',
    };
    await openAttachment(att, account());
    expect(mockedFetch).toHaveBeenCalledWith(
      att.uri,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
        }),
      })
    );
    expect(mockedShare).toHaveBeenCalledWith(
      expect.stringContaining('doc.txt'),
      expect.objectContaining({ mimeType: 'text/plain' })
    );
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('opens external URIs in the browser without sending credentials', async () => {
    const att: EventAttachment = { uri: 'https://other.tld/pub/f.pdf' };
    await openAttachment(att, account());
    expect(Linking.openURL).toHaveBeenCalledWith(att.uri);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('treats a same-host URI as external when no account is available', async () => {
    const att: EventAttachment = { uri: 'https://cloud.example.com/f.pdf' };
    await openAttachment(att, null);
    expect(Linking.openURL).toHaveBeenCalledWith(att.uri);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('alerts when the download fails', async () => {
    mockedFetch.mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => null },
    } as unknown as Awaited<ReturnType<typeof trustedFetch>>);
    const att: EventAttachment = { uri: 'https://cloud.example.com/f.pdf' };
    await openAttachment(att, account());
    expect(Alert.alert).toHaveBeenCalledWith('Could not open this attachment');
    expect(mockedShare).not.toHaveBeenCalled();
  });

  it('alerts when sharing is unavailable', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
    const att: EventAttachment = { base64: 'aGk=' };
    await openAttachment(att, account());
    expect(Alert.alert).toHaveBeenCalledWith('Could not open this attachment');
  });

  it('does nothing for a non-openable attachment', async () => {
    await openAttachment({ uri: 'cid:part1' }, account());
    expect(mockedFetch).not.toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('rejects a base64 attachment whose declared SIZE lies about the payload', async () => {
    const att: EventAttachment = {
      base64: 'x'.repeat(15 * 1024 * 1024),
      size: 1,
      filename: 'big.bin',
    };
    await openAttachment(att, account());
    expect(Alert.alert).toHaveBeenCalledWith('This attachment is too large to open');
    expect(mockedShare).not.toHaveBeenCalled();
  });

  it('checks the real download size when Content-Length is missing', async () => {
    mockedFetch.mockResolvedValue(fetchOk('x'.repeat(15 * 1024 * 1024)));
    const att: EventAttachment = {
      uri: 'https://cloud.example.com/f.bin',
      filename: 'f.bin',
    };
    await openAttachment(att, account());
    expect(Alert.alert).toHaveBeenCalledWith('This attachment is too large to open');
    expect(mockedWrite).not.toHaveBeenCalled();
    expect(mockedShare).not.toHaveBeenCalled();
  });

  describe('inline (occurrence) attachments', () => {
    const inlineIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:rec-1
DTSTART:20260601T140000Z
DTEND:20260601T150000Z
RRULE:FREQ=DAILY
ATTACH;ENCODING=BASE64;VALUE=BINARY;FMTTYPE=text/plain;FILENAME=note.txt:aGVsbG8=
END:VEVENT
END:VCALENDAR`;

    it('re-fetches the event ICS and opens the embedded file', async () => {
      mockedFetchIcs.mockResolvedValue(inlineIcs);
      const att: EventAttachment = {
        inline: true,
        filename: 'note.txt',
        fmttype: 'text/plain',
        size: 5,
      };
      await openAttachment(att, account(), '/cal/rec-1.ics');
      expect(mockedFetchIcs).toHaveBeenCalledWith(account(), '/cal/rec-1.ics');
      expect(mockedWrite).toHaveBeenCalledWith(
        expect.stringContaining('note.txt'),
        'aGVsbG8=',
        { encoding: 'base64' }
      );
      expect(mockedShare).toHaveBeenCalled();
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('alerts when the attachment is missing from the fetched ICS', async () => {
      mockedFetchIcs.mockResolvedValue('BEGIN:VCALENDAR\nEND:VCALENDAR');
      await openAttachment(
        { inline: true, filename: 'gone.txt' },
        account(),
        '/cal/rec-1.ics',
      );
      expect(Alert.alert).toHaveBeenCalledWith('Could not open this attachment');
      expect(mockedShare).not.toHaveBeenCalled();
    });

    it('alerts when no account or href is available', async () => {
      await openAttachment({ inline: true, filename: 'n.txt' }, null);
      expect(Alert.alert).toHaveBeenCalledWith('Could not open this attachment');
      expect(mockedFetchIcs).not.toHaveBeenCalled();
    });
  });
});
