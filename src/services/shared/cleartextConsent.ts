import { storage } from '@/storage';
import { hostKeyFromUrl } from './certPins';
import { classifyHost } from './hostClass';

const KEY = 'cleartext_consent';

type ConsentMap = Record<string, true>;

export function getCleartextConsents(): ConsentMap {
  const raw = storage.getString(KEY);
  return raw ? (JSON.parse(raw) as ConsentMap) : {};
}

function save(map: ConsentMap): void {
  storage.set(KEY, JSON.stringify(map));
}

export function hasCleartextConsent(host: string): boolean {
  return getCleartextConsents()[host] === true;
}

export function addCleartextConsent(host: string): void {
  save({ ...getCleartextConsents(), [host]: true });
}

export function removeCleartextConsent(host: string): void {
  const map = getCleartextConsents();
  delete map[host];
  save(map);
}

/**
 * HTTPS is always allowed. Plain HTTP is allowed to hosts that are only
 * reachable from a network the user is already on; to a publicly routable
 * host it needs an explicit, previously stored, per-host consent.
 *
 * An unparseable URL is allowed through — the native layer will fail on it,
 * and the consent dialog has nothing meaningful to show for it.
 */
export function isCleartextAllowed(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  if (parsed.protocol !== 'http:') return true;
  if (classifyHost(parsed.hostname) === 'local') return true;
  return hasCleartextConsent(hostKeyFromUrl(url));
}
