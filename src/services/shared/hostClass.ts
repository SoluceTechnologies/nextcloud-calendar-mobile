/**
 * Splits hostnames into "reachable only from a network the user is already on"
 * and "routable from the public internet". Used to decide whether cleartext
 * HTTP needs explicit consent.
 *
 * Anything unparseable is reported as `public`: a wrong guess in that direction
 * costs one confirmation dialog, the other direction costs an app password.
 */

const LOCAL_SUFFIXES = ['.local', '.home.arpa', '.internal', '.lan'];

function ipv4Octets(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const octets = m.slice(1, 5).map(Number);
  return octets.every((n) => n <= 255) ? octets : null;
}

function isPrivateIpv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 127 || a === 10) return true;              // loopback, RFC1918 /8
  if (a === 172 && b >= 16 && b <= 31) return true;    // RFC1918 /12
  if (a === 192 && b === 168) return true;             // RFC1918 /16
  if (a === 100 && b >= 64 && b <= 127) return true;   // CGNAT, used by Tailscale
  if (a === 169 && b === 254) return true;             // link-local
  return false;
}

function isPrivateIpv6(host: string): boolean {
  if (host === '::1') return true;                     // loopback
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;    // fc00::/7 unique local
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true;    // fe80::/10 link-local
  return false;
}

export function classifyHost(hostname: string): 'local' | 'public' {
  const host = hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  if (!host) return 'public';
  if (host === 'localhost') return 'local';

  const octets = ipv4Octets(host);
  if (octets) return isPrivateIpv4(octets) ? 'local' : 'public';
  if (/^\d+(\.\d+)*$/.test(host)) return 'public';     // malformed dotted-quad

  if (host.includes(':')) return isPrivateIpv6(host) ? 'local' : 'public';
  if (!host.includes('.')) return 'local';             // single-label LAN name
  if (LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return 'local';
  return 'public';
}

export function isLocalHostname(hostname: string): boolean {
  return classifyHost(hostname) === 'local';
}
