import { storage } from '@/storage';
import { hostKeyFromUrl } from './certPins';
import { classifyHost } from './hostClass';

const KEY = 'cleartext_consent';

type ConsentMap = Record<string, true>;

export function getCleartextConsents(): ConsentMap {
  const raw = storage.getString(KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as ConsentMap;
  } catch {
    return {};
  }
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
