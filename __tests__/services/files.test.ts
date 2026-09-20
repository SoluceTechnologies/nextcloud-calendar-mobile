import type { Account } from '@/types';

jest.mock('@/services/shared/trustedFetch', () => ({
  trustedFetch: jest.fn(),
}));

import { trustedFetch } from '@/services/shared/trustedFetch';
import {
  deleteRemoteFile,
  ensureFolder,
  fileDavUrl,
  isOwnDavFile,
  listDavFolder,
  ownDavPath,
  uploadAttachmentFile,
} from '@/services/nextcloud/files';

const req = trustedFetch as jest.Mock;

const account = {
  id: 'acc-1',
  baseUrl: 'https://srv',
  davUserId: 'alice',
  username: 'alice',
  appPassword: 'pw',
} as Account;

const res = (status: number) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  text: async () => '',
  base64: async () => '',
});

beforeEach(() => req.mockReset());

describe('ensureFolder', () => {
  it('MKCOLs the folder and accepts 201', async () => {
    req.mockResolvedValueOnce(res(201));
    await ensureFolder(account, '/Calendar');
    expect(req).toHaveBeenCalledWith(
      'https://srv/remote.php/dav/files/alice/Calendar',
      expect.objectContaining({ method: 'MKCOL' }),
    );
  });

  it('treats 405 as already-existing', async () => {
    req.mockResolvedValueOnce(res(405));
    await expect(ensureFolder(account, '/Calendar')).resolves.toBeUndefined();
  });

  it('throws on other failures', async () => {
    req.mockResolvedValueOnce(res(403));
    await expect(ensureFolder(account, '/Calendar')).rejects.toThrow();
  });
});

describe('uploadAttachmentFile', () => {
  it('uploads under Calendar/ and returns the DAV url', async () => {
    req
      .mockResolvedValueOnce(res(201)) // MKCOL
      .mockResolvedValueOnce(res(404)) // HEAD conflict check
      .mockResolvedValueOnce(res(201)); // PUT
    const out = await uploadAttachmentFile(account, 'doc.pdf', 'aGk=', 'application/pdf');
    expect(out.filename).toBe('doc.pdf');
    expect(out.davUrl).toBe('https://srv/remote.php/dav/files/alice/Calendar/doc.pdf');
    expect(out.path).toBe('/Calendar/doc.pdf');
    expect(req).toHaveBeenLastCalledWith(
      out.davUrl,
      expect.objectContaining({
        method: 'PUT',
        bodyBase64: 'aGk=',
        headers: expect.objectContaining({
          'Content-Type': 'application/pdf',
          'If-None-Match': '*',
        }),
      }),
    );
  });

  it('sanitizes filenames that would escape the attachments folder', async () => {
    req
      .mockResolvedValueOnce(res(405)) // MKCOL: exists
      .mockResolvedValueOnce(res(404)) // HEAD
      .mockResolvedValueOnce(res(201)); // PUT
    const out = await uploadAttachmentFile(account, '../evil.txt', 'aGk=');
    expect(out.path).toBe('/Calendar/.._evil.txt');
    expect(out.davUrl).toBe('https://srv/remote.php/dav/files/alice/Calendar/.._evil.txt');

    req.mockReset();
    req
      .mockResolvedValueOnce(res(405))
      .mockResolvedValueOnce(res(404))
      .mockResolvedValueOnce(res(201));
    const dot = await uploadAttachmentFile(account, '..', 'aGk=');
    expect(dot.filename).toBe('attachment');
    expect(dot.path).toBe('/Calendar/attachment');
  });

  it('retries the next suffix when the PUT loses an upload race (412)', async () => {
    req
      .mockResolvedValueOnce(res(405)) // MKCOL: exists
      .mockResolvedValueOnce(res(200)) // HEAD doc.pdf → exists
      .mockResolvedValueOnce(res(404)) // HEAD doc (2).pdf → free
      .mockResolvedValueOnce(res(412)) // PUT doc (2).pdf → lost the race
      .mockResolvedValueOnce(res(200)) // HEAD doc.pdf → still exists
      .mockResolvedValueOnce(res(200)) // HEAD doc (2).pdf → taken meanwhile
      .mockResolvedValueOnce(res(404)) // HEAD doc (3).pdf → free
      .mockResolvedValueOnce(res(201)); // PUT doc (3).pdf
    const out = await uploadAttachmentFile(account, 'doc.pdf', 'aGk=');
    expect(out.filename).toBe('doc (3).pdf');
    expect(out.path).toBe('/Calendar/doc (3).pdf');
  });

  it('resolves name conflicts with a (n) suffix', async () => {
    req
      .mockResolvedValueOnce(res(405)) // MKCOL: exists
      .mockResolvedValueOnce(res(200)) // HEAD doc.pdf → exists
      .mockResolvedValueOnce(res(404)) // HEAD doc (2).pdf → free
      .mockResolvedValueOnce(res(201)); // PUT
    const out = await uploadAttachmentFile(account, 'doc.pdf', 'aGk=');
    expect(out.filename).toBe('doc (2).pdf');
    expect(out.davUrl).toContain('doc%20(2).pdf');
  });

  it('throws when the PUT fails', async () => {
    req
      .mockResolvedValueOnce(res(405))
      .mockResolvedValueOnce(res(404))
      .mockResolvedValueOnce(res(401));
    await expect(uploadAttachmentFile(account, 'x', 'aGk=')).rejects.toThrow();
  });

  it('encodes special characters in the path', () => {
    expect(fileDavUrl(account, '/Calendar/été 2026.pdf')).toBe(
      'https://srv/remote.php/dav/files/alice/Calendar/%C3%A9t%C3%A9%202026.pdf',
    );
  });
});

describe('ownDavPath / isOwnDavFile', () => {
  it('maps an own DAV url back to its path', () => {
    expect(
      ownDavPath(account, 'https://srv/remote.php/dav/files/alice/Calendar/doc%20x.pdf'),
    ).toBe('/Calendar/doc x.pdf');
  });

  it('rejects foreign or non-files urls', () => {
    expect(ownDavPath(account, 'https://other.example.com/remote.php/dav/files/alice/x')).toBeNull();
    expect(ownDavPath(account, 'https://srv/remote.php/dav/calendars/alice/personal/e.ics')).toBeNull();
    expect(ownDavPath(account, 'https://srv/f/1234')).toBeNull();
    expect(isOwnDavFile(account, { uri: 'https://srv/f/1234' })).toBe(false);
    expect(isOwnDavFile(account, {})).toBe(false);
    expect(
      isOwnDavFile(account, {
        uri: 'https://srv/remote.php/dav/files/alice/Calendar/doc.pdf',
      }),
    ).toBe(true);
  });

  it('rejects paths that escape the files root after decoding', () => {
    expect(
      ownDavPath(account, 'https://srv/remote.php/dav/files/alice/Calendar/%2E%2E/secret'),
    ).toBeNull();
    expect(ownDavPath(account, 'https://srv/remote.php/dav/files/alice/%bad')).toBeNull();
    expect(
      ownDavPath(account, 'https://srv/remote.php/dav/files/alice/Calendar/doc%20x.pdf'),
    ).toBe('/Calendar/doc x.pdf');
  });
});

describe('listDavFolder', () => {
  const listing =
    '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">' +
    '<d:response><d:href>/remote.php/dav/files/alice/Calendar/</d:href>' +
    '<d:propstat><d:prop><d:displayname>Calendar</d:displayname>' +
    '<d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>' +
    '<d:response><d:href>/remote.php/dav/files/alice/Calendar/z.txt</d:href>' +
    '<d:propstat><d:prop><d:displayname>z.txt</d:displayname>' +
    '<d:getcontenttype>text/plain</d:getcontenttype>' +
    '<d:getcontentlength>32</d:getcontentlength></d:prop></d:propstat></d:response>' +
    '<d:response><d:href>/remote.php/dav/files/alice/Calendar/Sub%20dir/</d:href>' +
    '<d:propstat><d:prop><d:displayname>Sub dir</d:displayname>' +
    '<d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response></d:multistatus>';

  it('lists a folder, skipping itself and sorting directories first', async () => {
    req.mockResolvedValueOnce({ ...res(207), text: async () => listing });
    const out = await listDavFolder(account, '/Calendar');
    expect(req).toHaveBeenCalledWith(
      'https://srv/remote.php/dav/files/alice/Calendar/',
      expect.objectContaining({ method: 'PROPFIND' }),
    );
    // SabreDAV rejects elements whose `d:` prefix is undeclared.
    const sentBody = req.mock.calls[0][1].body as string;
    expect(sentBody).toContain('xmlns:d="DAV:"');
    expect(sentBody).toContain('<d:displayname/>');
    expect(out).toEqual([
      { path: '/Calendar/Sub dir', name: 'Sub dir', isDir: true, mime: undefined, size: undefined },
      { path: '/Calendar/z.txt', name: 'z.txt', isDir: false, mime: 'text/plain', size: 32 },
    ]);
  });

  it('throws on PROPFIND failure', async () => {
    req.mockResolvedValueOnce(res(403));
    await expect(listDavFolder(account, '/Calendar')).rejects.toThrow();
  });
});

describe('deleteRemoteFile', () => {
  it('DELETEs the file and accepts 404 as already-gone', async () => {
    req.mockResolvedValueOnce(res(204));
    await deleteRemoteFile(account, '/Calendar/doc.pdf');
    expect(req).toHaveBeenCalledWith(
      'https://srv/remote.php/dav/files/alice/Calendar/doc.pdf',
      expect.objectContaining({ method: 'DELETE' }),
    );
    req.mockResolvedValueOnce(res(404));
    await expect(deleteRemoteFile(account, '/Calendar/gone.pdf')).resolves.toBeUndefined();
  });

  it('throws on other failures', async () => {
    req.mockResolvedValueOnce(res(403));
    await expect(deleteRemoteFile(account, '/Calendar/x')).rejects.toThrow();
  });
});
