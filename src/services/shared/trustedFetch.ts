import {TlsTrust, type NativeResult} from './nativeTlsTrust';
import {utf8ToBase64, base64ToBytes, base64ToUtf8} from './base64';
import {parseRetryAfter} from './errors';
import { isCleartextAllowed } from './cleartextConsent';
import { hostKeyFromUrl } from './certPins';

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

export class CleartextNotConsentedError extends Error {
    host: string;

    constructor(host: string) {
        super(`Cleartext HTTP to ${host} has not been consented to`);
        this.name = 'CleartextNotConsentedError';
        this.host = host;
    }
}

export interface TrustedResponse {
    ok: boolean;
    status: number;
    headers: { get(name: string): string | null };

    text(): Promise<string>;

    arrayBuffer(): Promise<ArrayBuffer>;

    base64(): Promise<string>;

    json(): Promise<any>;
}

type Init = {
    method?: string;
    headers?: Record<string, string> | Headers;
    body?: string;
    timeoutMs?: number;
    /** Number of retries for transient network/server errors (429/5xx/timeout). Defaults to 0. */
    maxRetries?: number;
};

const DEFAULT_TIMEOUT_MS = 20000;
const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 8000;

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

function isRetryableStatus(status: number): boolean {
    return status === 429 || [500, 502, 503, 504].includes(status);
}

function isRetryableError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    return /network|fetch|timeout|abort|connection|econnrefused|econnreset/i.test(msg);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampedBackoffMs(attempt: number): number {
    return Math.min(BASE_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

function buildResponse(result: Extract<NativeResult, { type: 'response' }>): TrustedResponse {
    const {status, headers, bodyBase64} = result;
    const bytes = base64ToBytes(bodyBase64);
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const lower: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;

    return {
        ok: status >= 200 && status < 300,
        status,
        headers: {get: (name) => lower[name.toLowerCase()] ?? null},
        text: async () => base64ToUtf8(bodyBase64),
        arrayBuffer: async () => ab,
        base64: async () => bodyBase64,
        json: async () => JSON.parse(base64ToUtf8(bodyBase64)),
    };
}

async function doRequest(
    url: string,
    init: Init,
): Promise<NativeResult> {
    return TlsTrust.request({
        url,
        method: init.method ?? 'GET',
        headers: toRecord(init.headers),
        bodyBase64: init.body != null ? utf8ToBase64(init.body) : undefined,
        timeoutMs: init.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
}

export async function trustedFetch(url: string, init: Init = {}): Promise<TrustedResponse> {
    if (!isCleartextAllowed(url)) {
        throw new CleartextNotConsentedError(hostKeyFromUrl(url));
    }

    const maxRetries = init.maxRetries ?? 0;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await doRequest(url, init);

            if (result.type === 'untrusted_cert') {
                throw new UntrustedCertError(result);
            }

            if (result.type === 'response') {
                if (isRetryableStatus(result.status)) {
                    if (attempt < maxRetries) {
                        const retryAfter = parseRetryAfter(result.headers['retry-after'] ?? null);
                        const delayMs = result.status === 429 && retryAfter != null
                            ? Math.min(retryAfter * 1000, MAX_RETRY_DELAY_MS)
                            : clampedBackoffMs(attempt);
                        await sleep(delayMs);
                        continue;
                    }
                }
                return buildResponse(result);
            }
        } catch (e) {
            if (e instanceof UntrustedCertError) throw e;

            lastError = e;

            if (attempt < maxRetries && isRetryableError(e)) {
                await sleep(clampedBackoffMs(attempt));
                continue;
            }

            break;
        }
    }

    console.warn('[trustedFetch] request failed', init.method ?? 'GET', url, lastError);
    throw new Error('Network request failed');
}
