import i18n from '@/utils/i18n';

export class HttpError extends Error {
  readonly status: number;
  readonly retryAfter?: number;

  constructor(status: number, context: string, retryAfter?: number) {
    super(`${context} HTTP ${status}`);
    this.name = 'HttpError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds));
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, Math.round((date - Date.now()) / 1000));
  return undefined;
}

interface HttpResponseLike {
  status: number;
  headers?: { get(name: string): string | null };
}

export function httpErrorFrom(res: HttpResponseLike, context: string): HttpError {
  const retryAfter = parseRetryAfter(res.headers?.get('Retry-After') ?? null);
  return new HttpError(res.status, context, retryAfter);
}

function statusOf(error: unknown): number | undefined {
  if (error instanceof HttpError) return error.status;
  const msg = error instanceof Error ? error.message : '';
  const match = msg.match(/\b(\d{3})\b/);
  return match ? Number(match[1]) : undefined;
}

export function describeMutationError(error: unknown): string {
  const status = statusOf(error);

  switch (status) {
    case 401:
      return i18n.t('common.errorAuth');
    case 403:
      return i18n.t('common.errorPermission');
    case 404:
      return i18n.t('common.errorNotFound');
    case 429: {
      const retryAfter = error instanceof HttpError ? error.retryAfter : undefined;
      return retryAfter
        ? i18n.t('common.errorRateLimitedRetry', { seconds: retryAfter })
        : i18n.t('common.errorRateLimited');
    }
  }

  if (status !== undefined && status >= 500) {
    return i18n.t('common.errorServer');
  }

  const msg = error instanceof Error ? error.message : String(error ?? '');
  if (/network|fetch|timeout|abort/i.test(msg)) {
    return i18n.t('common.errorNetwork');
  }
  return i18n.t('common.errorGeneric');
}
