import { TlsTrust, type NativeResult } from './nativeTlsTrust';

export class UntrustedCertError extends Error {
  host: string;
  sha256: string;
  subject: string;
  issuer: string;
  notBefore: string;
  notAfter: string;

  constructor(d: Extract<NativeResult, { type: 'untrusted_cert' }>) {
    super(`Untrusted certificate for ${d.host}`);
    this.name = 'UntrustedCertError';
    this.host = d.host;
    this.sha256 = d.sha256;
    this.subject = d.subject;
    this.issuer = d.issuer;
    this.notBefore = d.notBefore;
    this.notAfter = d.notAfter;
  }
}

export interface TrustedResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  blob(): Promise<Blob>;
  json(): Promise<unknown>;
}

type Init = {
  method?: string;
  headers?: Record<string, string> | Headers;
  body?: string;
  timeoutMs?: number;
};

function toRecord(h?: Record<string, string> | Headers): Record<string, string> {
  if (!h) return {};
  if (typeof Headers !== 'undefined' && h instanceof Headers) {
    const o: Record<string, string> = {};
    h.forEach((v, k) => {
      o[k] = v;
    });
    return o;
  }
  return h as Record<string, string>;
}

export async function trustedFetch(url: string, init: Init = {}): Promise<TrustedResponse> {
  let result: NativeResult;
  try {
    result = await TlsTrust.request({
      url,
      method: init.method ?? 'GET',
      headers: toRecord(init.headers),
      bodyBase64: init.body != null ? Buffer.from(init.body, 'utf8').toString('base64') : undefined,
      timeoutMs: init.timeoutMs ?? 20000,
    });
  } catch {
    throw new Error('Network request failed');
  }

  if (result.type === 'untrusted_cert') throw new UntrustedCertError(result);

  const { status, headers, bodyBase64 } = result;
  const bytes = Buffer.from(bodyBase64, 'base64');
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => lower[name.toLowerCase()] ?? null },
    text: async () => bytes.toString('utf8'),
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    blob: async () => new Blob([bytes]),
    json: async () => JSON.parse(bytes.toString('utf8')),
  };
}
