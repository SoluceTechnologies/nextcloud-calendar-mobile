import { trustedFetch, UntrustedCertError } from '@/services/shared/trustedFetch';
import { TlsTrust } from '@/services/shared/nativeTlsTrust';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const req = TlsTrust.request as jest.Mock;

describe('trustedFetch', () => {
  afterEach(() => jest.clearAllMocks());

  it('adapts a native response (status/headers/text); 207 is 2xx-ok', async () => {
    req.mockResolvedValueOnce({
      type: 'response',
      status: 207,
      headers: { 'content-type': 'application/xml' },
      bodyBase64: b64('<xml/>'),
    });
    const res = await trustedFetch('https://h/dav', { method: 'PROPFIND' });
    expect(res.ok).toBe(true); // 207 Multi-Status is within 200-299
    expect(res.status).toBe(207);
    expect(res.headers.get('Content-Type')).toBe('application/xml');
    expect(await res.text()).toBe('<xml/>');
  });

  it('marks a 4xx as not ok', async () => {
    req.mockResolvedValueOnce({ type: 'response', status: 401, headers: {}, bodyBase64: '' });
    const res = await trustedFetch('https://h/x');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });

  it('marks 2xx as ok and encodes string body to base64', async () => {
    req.mockResolvedValueOnce({ type: 'response', status: 200, headers: {}, bodyBase64: b64('ok') });
    const res = await trustedFetch('https://h/x', { method: 'PUT', body: 'hello' });
    expect(res.ok).toBe(true);
    expect(req).toHaveBeenCalledWith(
      expect.objectContaining({ bodyBase64: b64('hello'), method: 'PUT', timeoutMs: 20000 }),
    );
  });

  it('throws UntrustedCertError on untrusted_cert result', async () => {
    const untrusted = {
      type: 'untrusted_cert',
      host: 'h:443',
      sha256: 'AA:BB',
      subject: 'CN=h',
      issuer: 'CN=h',
      notBefore: '2026-01-01T00:00:00Z',
      notAfter: '2027-01-01T00:00:00Z',
    };
    req.mockResolvedValue(untrusted);
    await expect(trustedFetch('https://h/x')).rejects.toBeInstanceOf(UntrustedCertError);
    await expect(trustedFetch('https://h/x')).rejects.toMatchObject({ host: 'h:443', sha256: 'AA:BB' });
  });

  it('maps a transport rejection to a network error', async () => {
    req.mockRejectedValueOnce(new Error('connect timeout'));
    await expect(trustedFetch('https://h/x')).rejects.toThrow(/network|fetch|timeout/i);
  });
});
