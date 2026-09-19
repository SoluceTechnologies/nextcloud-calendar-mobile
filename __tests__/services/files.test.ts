import type { Account } from '@/types';

jest.mock('@/services/shared/trustedFetch', () => ({
  trustedFetch: jest.fn(),
}));

import { trustedFetch } from '@/services/shared/trustedFetch';
import { ensureFolder, fileDavUrl, uploadAttachmentFile } from '@/services/nextcloud/files';

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
    expect(req).toHaveBeenLastCalledWith(
      out.davUrl,
      expect.objectContaining({
        method: 'PUT',
        bodyBase64: 'aGk=',
        headers: expect.objectContaining({ 'Content-Type': 'application/pdf' }),
      }),
    );
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
