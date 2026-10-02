import { maybeUpgradeToHttps } from '@/services/shared/httpsProbe';
import { trustedFetch, UntrustedCertError } from '@/services/shared/trustedFetch';

jest.mock('@/services/shared/trustedFetch', () => ({
  ...jest.requireActual('@/services/shared/trustedFetch'),
  trustedFetch: jest.fn(),
}));

const fetchMock = trustedFetch as jest.Mock;
const okResponse = { ok: true, status: 200 };

describe('maybeUpgradeToHttps', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('leaves an https url untouched and never probes', async () => {
    expect(await maybeUpgradeToHttps('https://cloud.example.com')).toBe('https://cloud.example.com');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('upgrades when the server answers on https', async () => {
    fetchMock.mockResolvedValueOnce(okResponse);
    expect(await maybeUpgradeToHttps('http://cloud.example.com')).toBe('https://cloud.example.com');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://cloud.example.com/status.php',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('probes status.php under a subpath install and keeps the subpath', async () => {
    fetchMock.mockResolvedValueOnce(okResponse);
    expect(await maybeUpgradeToHttps('http://box.example.com/nextcloud')).toBe(
      'https://box.example.com/nextcloud'
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://box.example.com/nextcloud/status.php',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('keeps an explicit non-default port', async () => {
    fetchMock.mockResolvedValueOnce(okResponse);
    expect(await maybeUpgradeToHttps('http://192.168.1.50:8080')).toBe('https://192.168.1.50:8080');
  });

  it('keeps the http url when the probe fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network request failed'));
    expect(await maybeUpgradeToHttps('http://203.0.113.5')).toBe('http://203.0.113.5');
  });

  it('keeps the http url when https answers with an error status', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502 });
    expect(await maybeUpgradeToHttps('http://203.0.113.5')).toBe('http://203.0.113.5');
  });

  it('re-throws an untrusted certificate so the trust sheet can handle it', async () => {
    fetchMock.mockRejectedValueOnce(
      new UntrustedCertError({
        type: 'untrusted_cert',
        host: '192.168.1.50:443',
        sha256: 'AA:BB',
        subject: 'CN=nc',
        issuer: 'CN=nc',
        notBefore: '2026-01-01T00:00:00Z',
        notAfter: '2027-01-01T00:00:00Z',
      })
    );
    await expect(maybeUpgradeToHttps('http://192.168.1.50')).rejects.toBeInstanceOf(
      UntrustedCertError
    );
  });
});
