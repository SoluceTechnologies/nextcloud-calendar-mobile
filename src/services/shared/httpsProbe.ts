import { trustedFetch, UntrustedCertError } from './trustedFetch';

const PROBE_TIMEOUT_MS = 4000;

/**
 * Many self-hosters have TLS running and type "http" out of habit. Before
 * asking anyone to accept an unencrypted connection, check whether the same
 * server answers over https and silently prefer it.
 *
 * `/status.php` is unauthenticated, present on every Nextcloud, and cheap.
 *
 * An untrusted certificate is re-thrown rather than swallowed: the caller's
 * certificate sheet pins it, and the retry then lands on https.
 */
export async function maybeUpgradeToHttps(url: string): Promise<string> {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return url;
    }
    if (parsed.protocol !== 'http:') return url;

    const candidate = new URL(url);
    candidate.protocol = 'https:';
    if (!parsed.port) candidate.port = '';

    const basePath = candidate.pathname.replace(/\/$/, '');
    const probeUrl = `${candidate.origin}${basePath}/status.php`;

    try {
        const res = await trustedFetch(probeUrl, {method: 'GET', timeoutMs: PROBE_TIMEOUT_MS});
        if (res.ok) return `${candidate.origin}${basePath}`;
    } catch (e) {
        if (e instanceof UntrustedCertError) throw e;
    }
    return url;
}
