import type { Account } from '@/types';

jest.mock('@/services/shared/trustedFetch', () => ({
  trustedFetch: jest.fn(),
}));

import { trustedFetch } from '@/services/shared/trustedFetch';
import {
  internalFileId,
  isFileLinkUri,
  isOwnFileRef,
  publicShareToken,
  resolveInternalFile,
  shareDownloadUrl,
} from '@/services/nextcloud/fileLinks';

const req = trustedFetch as jest.Mock;

const account = {
  id: 'acc-1',
  baseUrl: 'https://srv',
  davUserId: 'alice',
  username: 'alice',
  appPassword: 'pw',
} as Account;

const res = (status: number, body = '') => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  text: async () => body,
  base64: async () => '',
});

beforeEach(() => req.mockReset());

describe('internalFileId', () => {
  it('parses absolute and relative /f/ links on the account host', () => {
    expect(internalFileId(account, 'https://srv/f/326')).toBe(326);
    expect(internalFileId(account, 'https://srv/index.php/f/326')).toBe(326);
    expect(internalFileId(account, '/f/326')).toBe(326);
    expect(internalFileId(account, 'f/326')).toBe(326);
    expect(internalFileId(account, '/index.php/f/326/')).toBe(326);
  });

  it('rejects foreign hosts and non-file links', () => {
    expect(internalFileId(account, 'https://other/f/326')).toBeNull();
    expect(internalFileId(account, 'https://srv/f/abc')).toBeNull();
    expect(internalFileId(account, 'https://srv/s/326')).toBeNull();
    expect(
      internalFileId(account, 'https://srv/remote.php/dav/files/alice/f/326'),
    ).toBeNull();
  });
});

describe('publicShareToken', () => {
  it('parses /s/ links with optional suffixes', () => {
    expect(publicShareToken(account, 'https://srv/s/AbCdEf123')).toBe('AbCdEf123');
    expect(publicShareToken(account, 'https://srv/index.php/s/AbCdEf123')).toBe(
      'AbCdEf123',
    );
    expect(publicShareToken(account, '/s/tok/download')).toBe('tok');
    expect(publicShareToken(account, 's/tok/download/path/in/share')).toBe('tok');
  });

  it('rejects foreign hosts and /f/ links', () => {
    expect(publicShareToken(account, 'https://other/s/tok')).toBeNull();
    expect(publicShareToken(account, 'https://srv/f/12')).toBeNull();
  });
});

describe('shareDownloadUrl / isFileLinkUri / isOwnFileRef', () => {
  it('builds the anonymous download endpoint', () => {
    expect(shareDownloadUrl(account, 'tok')).toBe('https://srv/s/tok/download');
  });

  it('recognizes resolvable link shapes, relative or absolute', () => {
    expect(isFileLinkUri('https://srv/f/1')).toBe(true);
    expect(isFileLinkUri('/index.php/f/1')).toBe(true);
    expect(isFileLinkUri('f/1')).toBe(true);
    expect(isFileLinkUri('https://srv/s/tok')).toBe(true);
    expect(isFileLinkUri('https://srv/remote.php/dav/files/a/x')).toBe(false);
    expect(isFileLinkUri(undefined)).toBe(false);
  });

  it('treats /f/ links as own files for the delete option', () => {
    expect(isOwnFileRef(account, { uri: 'https://srv/f/326' })).toBe(true);
    expect(isOwnFileRef(account, { uri: '/f/326' })).toBe(true);
    expect(isOwnFileRef(account, { uri: 'https://other/f/326' })).toBe(false);
    expect(isOwnFileRef(account, { uri: 'https://srv/s/tok' })).toBe(false);
  });
});

describe('resolveInternalFile', () => {
  const searchHit =
    '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">' +
    '<d:response><d:href>/remote.php/dav/files/alice/Calendar/doc%20x.pdf</d:href>' +
    '<d:propstat><d:prop><d:displayname>doc x.pdf</d:displayname>' +
    '<d:getcontenttype>application/pdf</d:getcontenttype>' +
    '<d:getcontentlength>42</d:getcontentlength></d:prop>' +
    '<d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>';

  it('resolves a file id via SEARCH basicsearch', async () => {
    req.mockResolvedValueOnce(res(207, searchHit));
    const out = await resolveInternalFile(account, 326);
    expect(out).toEqual({
      davUrl: 'https://srv/remote.php/dav/files/alice/Calendar/doc%20x.pdf',
      path: '/Calendar/doc x.pdf',
      filename: 'doc x.pdf',
      mime: 'application/pdf',
      size: 42,
    });
    expect(req).toHaveBeenCalledWith(
      'https://srv/remote.php/dav',
      expect.objectContaining({
        method: 'SEARCH',
        body: expect.stringContaining('<oc:fileid/></d:prop><d:literal>326'),
      }),
    );
  });

  it('falls back to a Depth:infinity PROPFIND when SEARCH is unsupported', async () => {
    req
      .mockResolvedValueOnce(res(501)) // SEARCH not implemented
      .mockResolvedValueOnce(
        res(
          207,
          '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">' +
            '<d:response><d:href>/remote.php/dav/files/alice/</d:href>' +
            '<d:propstat><d:prop><oc:fileid>300</oc:fileid></d:prop></d:propstat></d:response>' +
            '<d:response><d:href>/remote.php/dav/files/alice/pic.png</d:href>' +
            '<d:propstat><d:prop><oc:fileid>326</oc:fileid>' +
            '<d:displayname>pic.png</d:displayname><d:getcontenttype>image/png</d:getcontenttype>' +
            '</d:prop></d:propstat></d:response></d:multistatus>',
        ),
      );
    const out = await resolveInternalFile(account, 326);
    expect(out?.path).toBe('/pic.png');
    expect(out?.filename).toBe('pic.png');
    expect(req).toHaveBeenNthCalledWith(
      2,
      'https://srv/remote.php/dav/files/alice/',
      expect.objectContaining({ method: 'PROPFIND' }),
    );
  });

  it('returns null when the file id does not exist', async () => {
    req
      .mockResolvedValueOnce(
        res(207, '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"/>'),
      )
      .mockResolvedValueOnce(
        res(207, '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"/>'),
      );
    await expect(resolveInternalFile(account, 999)).resolves.toBeNull();
  });
});
