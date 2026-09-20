import type { Account } from '@/types';

jest.mock('@/services/shared/trustedFetch', () => ({
  trustedFetch: jest.fn(),
}));

import { trustedFetch } from '@/services/shared/trustedFetch';
import { createPublicLinkShare } from '@/services/nextcloud/shares';

const req = trustedFetch as jest.Mock;

const account = {
  id: 'acc-1',
  baseUrl: 'https://srv',
  davUserId: 'alice',
  username: 'alice',
  appPassword: 'pw',
} as Account;

const res = (status: number, json?: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  text: async () => '',
  json: async () => json,
});

beforeEach(() => req.mockReset());

describe('createPublicLinkShare', () => {
  it('POSTs a read-only shareType 3 and parses url/token/id', async () => {
    req.mockResolvedValueOnce(
      res(200, {
        ocs: {
          meta: { status: 'ok', statuscode: 200 },
          data: { id: 42, token: 'AbCdEfGh', url: 'https://srv/s/AbCdEfGh' },
        },
      }),
    );
    const share = await createPublicLinkShare(account, '/Calendar/doc.pdf');
    expect(req).toHaveBeenCalledWith(
      'https://srv/ocs/v2.php/apps/files_sharing/api/v1/shares',
      expect.objectContaining({
        method: 'POST',
        body: 'path=%2FCalendar%2Fdoc.pdf&shareType=3&permissions=1',
      }),
    );
    const headers = req.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['OCS-APIRequest']).toBe('true');
    expect(share).toEqual({
      url: 'https://srv/s/AbCdEfGh',
      token: 'AbCdEfGh',
      id: 42,
    });
  });

  it('throws on OCS failure', async () => {
    req.mockResolvedValueOnce(res(403));
    await expect(createPublicLinkShare(account, '/x')).rejects.toThrow();
  });

  it('throws when the response lacks a token', async () => {
    req.mockResolvedValueOnce(res(200, { ocs: { data: {} } }));
    await expect(createPublicLinkShare(account, '/x')).rejects.toThrow();
  });
});
