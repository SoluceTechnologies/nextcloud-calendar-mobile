import { HttpError, parseRetryAfter, describeMutationError } from '../../src/services/shared/errors';
import i18n from '../../src/utils/i18n';

describe('parseRetryAfter', () => {
  it('parses a value in seconds', () => {
    expect(parseRetryAfter('120')).toBe(120);
  });

  it('parses an HTTP date into remaining seconds', () => {
    const in30s = new Date(Date.now() + 30_000).toUTCString();
    const parsed = parseRetryAfter(in30s);
    expect(parsed).toBeGreaterThanOrEqual(28);
    expect(parsed).toBeLessThanOrEqual(31);
  });

  it('returns undefined for null or invalid input', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('bogus')).toBeUndefined();
  });
});

describe('describeMutationError', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('maps 403 to the permission message', () => {
    expect(describeMutationError(new HttpError(403, 'putEvent'))).toBe(
      i18n.t('common.errorPermission'),
    );
  });

  it('maps 401 to the authentication message', () => {
    expect(describeMutationError(new HttpError(401, 'putEvent'))).toBe(
      i18n.t('common.errorAuth'),
    );
  });

  it('maps 5xx to the server message', () => {
    expect(describeMutationError(new HttpError(503, 'putEvent'))).toBe(
      i18n.t('common.errorServer'),
    );
  });

  it('maps 429 without Retry-After to the generic rate-limit message', () => {
    expect(describeMutationError(new HttpError(429, 'putEvent'))).toBe(
      i18n.t('common.errorRateLimited'),
    );
  });

  it('maps 429 with Retry-After including the delay', () => {
    const msg = describeMutationError(new HttpError(429, 'putEvent', 45));
    expect(msg).toContain('45');
  });

  it('falls back to the network message for a connection error', () => {
    expect(describeMutationError(new Error('network request failed'))).toBe(
      i18n.t('common.errorNetwork'),
    );
  });
});
