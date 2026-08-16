import { TlsTrust, type NativeResult } from './nativeTlsTrust';
import { utf8ToBase64, base64ToBytes, base64ToUtf8 } from './base64';

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
  // Matches fetch()'s Response.json() (any), so existing json?.ocs?.data access compiles.
  json(): Promise<any>;
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
      bodyBase64: init.body != null ? utf8ToBase64(init.body) : undefined,
      timeoutMs: init.timeoutMs ?? 20000,
    });
  } catch {
    throw new Error('Network request failed');
  }

  if (result.type === 'untrusted_cert') throw new UntrustedCertError(result);

  const { status, headers, bodyBase64 } = result;
  const bytes = base64ToBytes(bodyBase64);
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => lower[name.toLowerCase()] ?? null },
    text: async () => base64ToUtf8(bodyBase64),
    arrayBuffer: async () => ab,
    blob: async () => new Blob([ab]),
    json: async () => JSON.parse(base64ToUtf8(bodyBase64)),
  };
}
