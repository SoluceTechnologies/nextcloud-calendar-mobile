import { Alert, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  attachmentDisplayName,
  attachmentIcon,
  canEditAttachment,
  prepareAttachmentEdit,
  formatBytes,
  isOpenableAttachment,
  mimeFromName,
  openAttachment,
} from '../../../src/features/event/utils/attachments';
import { trustedFetch, ResponseTooLargeError } from '../../../src/services/shared/trustedFetch';
import { fetchEventIcs } from '../../../src/services/nextcloud/caldav';
import { base64Fingerprint } from '../../../src/utils/caldav-parse';
import {
  fetchDirectEditors,
  openDirectEditingUrl,
} from '../../../src/services/nextcloud/directEditing';
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
  ResponseTooLargeError: class ResponseTooLargeError extends Error {},
}));

jest.mock('../../../src/services/nextcloud/directEditing', () => ({
  fetchDirectEditors: jest.fn(),
  openDirectEditingUrl: jest.fn(),
  editorForMime:
    jest.requireActual('../../../src/services/nextcloud/directEditing').editorForMime,
}));

jest.mock('../../../src/services/nextcloud/caldav', () => ({
  fetchEventIcs: jest.fn(),
  decodeXmlEntities: (s: string) =>
    s
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&'),
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
    // Relative links written by the web app resolve against the account.
    expect(isOpenableAttachment({ uri: '/f/123' })).toBe(true);
    expect(isOpenableAttachment({ uri: 'index.php/s/tok' })).toBe(true);
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

  it('never sends credentials to a same-host http URI on an https account', async () => {
    const att: EventAttachment = { uri: 'http://cloud.example.com/f.pdf' };
    await openAttachment(att, account());
    expect(Linking.openURL).toHaveBeenCalledWith(att.uri);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('attaches credentials to a same-origin http URI on an http account', async () => {
    mockedFetch.mockResolvedValue(fetchOk());
    const httpAccount = account({ baseUrl: 'http://nas.local' });
    const att: EventAttachment = {
      uri: 'http://nas.local/remote.php/dav/files/alice/doc.txt',
      filename: 'doc.txt',
    };
    await openAttachment(att, httpAccount);
    expect(mockedFetch).toHaveBeenCalledWith(
      att.uri,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
        }),
      })
    );
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('rejects an oversized download reported by HEAD without fetching the body', async () => {
    mockedFetch.mockImplementation(((_url: string, init?: { method?: string }) =>
      Promise.resolve(
        init?.method === 'HEAD'
          ? {
              ok: true,
              status: 200,
              headers: { get: () => String(20 * 1024 * 1024) },
              base64: () => Promise.resolve(''),
            }
          : fetchOk()
      )) as typeof trustedFetch);
    const att: EventAttachment = { uri: 'https://cloud.example.com/big.bin' };
    await openAttachment(att, account());
    expect(Alert.alert).toHaveBeenCalledWith('This attachment is too large to open');
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedShare).not.toHaveBeenCalled();
  });

  it('still downloads when the HEAD preflight fails', async () => {
    mockedFetch
      .mockRejectedValueOnce(new Error('head-fail'))
      .mockResolvedValueOnce(fetchOk());
    const att: EventAttachment = {
      uri: 'https://cloud.example.com/doc.txt',
      filename: 'doc.txt',
    };
    await openAttachment(att, account());
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(mockedShare).toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
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

  it('caps the download natively via maxBodyBytes and maps the abort to too-large', async () => {
    mockedFetch.mockImplementation(((_url: string, init?: { method?: string; maxBodyBytes?: number }) => {
      if (init?.method === 'HEAD') {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          base64: () => Promise.resolve(''),
        });
      }
      expect(init?.maxBodyBytes).toBe(10 * 1024 * 1024);
      return Promise.reject(new ResponseTooLargeError());
    }) as typeof trustedFetch);
    const att: EventAttachment = {
      uri: 'https://cloud.example.com/f.bin',
      filename: 'f.bin',
    };
    await openAttachment(att, account());
    expect(Alert.alert).toHaveBeenCalledWith('This attachment is too large to open');
    expect(mockedShare).not.toHaveBeenCalled();
  });

  it('resolves a /f/<id> link via SEARCH then downloads the DAV file', async () => {
    mockedFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 207,
        headers: { get: () => null },
        text: async () =>
          '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">' +
          '<d:response><d:href>/remote.php/dav/files/alice/Calendar/report.pdf</d:href>' +
          '<d:propstat><d:prop><d:displayname>report.pdf</d:displayname>' +
          '<d:getcontenttype>application/pdf</d:getcontenttype></d:prop></d:propstat>' +
          '</d:response></d:multistatus>',
      } as unknown as Awaited<ReturnType<typeof trustedFetch>>)
      .mockResolvedValue(fetchOk());
    const att: EventAttachment = {
      uri: 'https://cloud.example.com/f/326',
    };
    await openAttachment(att, account());
    expect(mockedFetch).toHaveBeenNthCalledWith(
      1,
      'https://cloud.example.com/remote.php/dav',
      expect.objectContaining({ method: 'SEARCH' }),
    );
    // HEAD preflight first, then the credentialed GET.
    expect(mockedFetch).toHaveBeenNthCalledWith(
      2,
      'https://cloud.example.com/remote.php/dav/files/alice/Calendar/report.pdf',
      expect.objectContaining({ method: 'HEAD' }),
    );
    expect(mockedFetch).toHaveBeenNthCalledWith(
      3,
      'https://cloud.example.com/remote.php/dav/files/alice/Calendar/report.pdf',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
        }),
      }),
    );
    expect(mockedShare).toHaveBeenCalledWith(
      expect.stringContaining('report.pdf'),
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
  });

  it('resolves a relative /f/<id> link against the account', async () => {
    mockedFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 207,
        headers: { get: () => null },
        text: async () =>
          '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">' +
          '<d:response><d:href>/remote.php/dav/files/alice/a.txt</d:href>' +
          '<d:propstat><d:prop><d:displayname>a.txt</d:displayname></d:prop></d:propstat>' +
          '</d:response></d:multistatus>',
      } as unknown as Awaited<ReturnType<typeof trustedFetch>>)
      .mockResolvedValue(fetchOk());
    await openAttachment({ uri: '/f/55' }, account());
    expect(mockedFetch).toHaveBeenNthCalledWith(
      3,
      'https://cloud.example.com/remote.php/dav/files/alice/a.txt',
      expect.anything(),
    );
    expect(mockedShare).toHaveBeenCalled();
  });

  it('alerts when the /f/<id> target no longer exists', async () => {
    const empty = {
      ok: true,
      status: 207,
      headers: { get: () => null },
      text: async () => '<d:multistatus xmlns:d="DAV:"/>',
    } as unknown as Awaited<ReturnType<typeof trustedFetch>>;
    mockedFetch.mockResolvedValueOnce(empty).mockResolvedValueOnce(empty);
    await openAttachment({ uri: 'https://cloud.example.com/f/999' }, account());
    expect(Alert.alert).toHaveBeenCalledWith('Could not open this attachment');
    expect(mockedShare).not.toHaveBeenCalled();
  });

  it('downloads a public /s/<token> link without credentials', async () => {
    mockedFetch.mockResolvedValue(fetchOk());
    const att: EventAttachment = {
      uri: 'https://cloud.example.com/s/tok123',
      filename: 'shared.pdf',
      fmttype: 'application/pdf',
    };
    await openAttachment(att, account());
    expect(mockedFetch).toHaveBeenCalledWith(
      'https://cloud.example.com/s/tok123/download',
      expect.objectContaining({ headers: {} }),
    );
    expect(mockedShare).toHaveBeenCalledWith(
      expect.stringContaining('shared.pdf'),
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('alerts instead of sharing an HTML page masquerading as a file', async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (n: string) => (n === 'content-type' ? 'text/html; charset=UTF-8' : null),
      },
      base64: async () => 'PGh0bWw+',
    } as unknown as Awaited<ReturnType<typeof trustedFetch>>);
    const att: EventAttachment = {
      uri: 'https://cloud.example.com/remote.php/dav/files/alice/doc.txt',
      filename: 'doc.txt',
    };
    await openAttachment(att, account());
    expect(mockedWrite).not.toHaveBeenCalled();
    expect(mockedShare).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Could not open this attachment');
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

    it('uses the stored digest to pick the right payload among same-metadata attachments', async () => {
      const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:dup
DTSTART:20260601T140000Z
DTEND:20260601T150000Z
ATTACH;ENCODING=BASE64;VALUE=BINARY;FMTTYPE=text/plain;FILENAME=same.txt:aGVsbG8=
ATTACH;ENCODING=BASE64;VALUE=BINARY;FMTTYPE=text/plain;FILENAME=same.txt:d29ybGQ=
END:VEVENT
END:VCALENDAR`;
      mockedFetchIcs.mockResolvedValue(ics);
      const att: EventAttachment = {
        inline: true,
        filename: 'same.txt',
        fmttype: 'text/plain',
        size: 5,
        digest: base64Fingerprint('d29ybGQ='),
      };
      await openAttachment(att, account(), '/cal/dup.ics');
      expect(mockedWrite).toHaveBeenCalledWith(
        expect.stringContaining('same.txt'),
        'd29ybGQ=',
        { encoding: 'base64' }
      );
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

describe('canEditAttachment', () => {
  const acc = account({ baseUrl: 'https://cloud.example.com', davUserId: 'alice' });
  const dav = 'https://cloud.example.com/remote.php/dav/files/alice/Calendar/a.txt';

  it('accepts own DAV URLs and /f/<id> references', () => {
    expect(canEditAttachment({ uri: dav }, acc)).toBe(true);
    expect(canEditAttachment({ uri: 'https://cloud.example.com/f/326' }, acc)).toBe(true);
    expect(canEditAttachment({ uri: '/f/326' }, acc)).toBe(true);
  });

  it('rejects shares, foreign files, inline and base64 content', () => {
    expect(canEditAttachment({ uri: 'https://cloud.example.com/s/tok' }, acc)).toBe(false);
    expect(canEditAttachment({ uri: 'https://other.tld/f.pdf' }, acc)).toBe(false);
    expect(canEditAttachment({ base64: 'aGk=' }, acc)).toBe(false);
    expect(canEditAttachment({ inline: true, filename: 'a.txt' }, acc)).toBe(false);
    expect(canEditAttachment({ uri: dav }, null)).toBe(false);
  });
});

describe('prepareAttachmentEdit', () => {
  const textEditor = {
    id: 'text',
    name: 'Nextcloud Text',
    mimetypes: ['text/plain', 'text/markdown'],
    optionalMimetypes: [],
  };

  it('resolves the DAV path and matching editor', async () => {
    (fetchDirectEditors as jest.Mock).mockResolvedValue([textEditor]);

    const session = await prepareAttachmentEdit(
      {
        uri: 'https://cloud.example.com/remote.php/dav/files/alice/Calendar/note.txt',
        filename: 'note.txt',
        fmttype: 'text/plain',
      },
      account({ baseUrl: 'https://cloud.example.com', davUserId: 'alice' }),
    );

    expect(session).toEqual({
      path: '/Calendar/note.txt',
      editorId: 'text',
      name: 'note.txt',
    });
  });

  it('falls back to a filename-based mime when FMTTYPE is missing', async () => {
    (fetchDirectEditors as jest.Mock).mockResolvedValue([textEditor]);

    const session = await prepareAttachmentEdit(
      { uri: 'https://cloud.example.com/remote.php/dav/files/alice/note.md' },
      account({ baseUrl: 'https://cloud.example.com', davUserId: 'alice' }),
    );

    expect(session).toEqual({
      path: '/note.md',
      editorId: 'text',
      name: 'note.md',
    });
  });

  it('alerts when no editor supports the mime type', async () => {
    (fetchDirectEditors as jest.Mock).mockResolvedValue([textEditor]);

    const session = await prepareAttachmentEdit(
      {
        uri: 'https://cloud.example.com/remote.php/dav/files/alice/big.zip',
        fmttype: 'application/zip',
      },
      account({ baseUrl: 'https://cloud.example.com', davUserId: 'alice' }),
    );

    expect(session).toBeNull();
    expect(Alert.alert).toHaveBeenCalledWith('Could not open the editor');
  });

  it('alerts for attachments outside own Files space', async () => {
    await prepareAttachmentEdit(
      { uri: 'https://other.tld/f.pdf' },
      account({ baseUrl: 'https://cloud.example.com' }),
    );
    expect(Alert.alert).toHaveBeenCalledWith('Could not open the editor');
    expect(fetchDirectEditors).not.toHaveBeenCalled();
  });
});

describe('mimeFromName', () => {
  it('maps common text extensions', () => {
    expect(mimeFromName('note.md')).toBe('text/markdown');
    expect(mimeFromName('a.txt')).toBe('text/plain');
    expect(mimeFromName('data.CSV')).toBe('text/csv');
    expect(mimeFromName('bin.exe')).toBeUndefined();
    expect(mimeFromName(undefined)).toBeUndefined();
  });
});
