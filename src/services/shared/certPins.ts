import { storage } from '@/storage';
import { TlsTrust } from './nativeTlsTrust';

const KEY = 'cert_pins';
type PinMap = Record<string, string[]>;

export function hostKeyFromUrl(url: string): string {
  const u = new URL(url);
  const port = u.port || (u.protocol === 'https:' ? '443' : '80');
  return `${u.hostname}:${port}`;
}

export function getPins(): PinMap {
  const raw = storage.getString(KEY);
  return raw ? (JSON.parse(raw) as PinMap) : {};
}

function save(map: PinMap): void {
  storage.set(KEY, JSON.stringify(map));
  TlsTrust.setPins(map);
}

export function hasPin(host: string, sha256: string): boolean {
  return (getPins()[host] ?? []).includes(sha256);
}

export function addPin(host: string, sha256: string): void {
  const map = getPins();
  const list = map[host] ?? [];
  if (!list.includes(sha256)) map[host] = [...list, sha256];
  save(map);
}

export function removePinsForHost(host: string): void {
  const map = getPins();
  delete map[host];
  save(map);
}

export function pushPinsToNative(): void {
  TlsTrust.setPins(getPins());
}
