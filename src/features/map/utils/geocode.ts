import { storage } from '@/storage';
import { trustedFetch } from '@/services/shared/trustedFetch';
import type { MapCoordinates } from '../types';

type CacheEntry = { result: MapCoordinates | null; ts: number };

const STORAGE_KEY = 'geocode_cache';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CACHE = 100;
const TIMEOUT_MS = 8000;

const USER_AGENT =
  'Nextcloud Calendar Mobile (https://github.com/SoluceTechnologies/nextcloud-calendar-mobile)';

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

function loadCache(): Map<string, CacheEntry> {
  try {
    const raw = storage.getString(STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Array<[string, CacheEntry]>;
    const now = Date.now();
    const cache = new Map<string, CacheEntry>();
    for (const [key, entry] of parsed) {
      if (now - entry.ts < TTL_MS) {
        cache.set(key, entry);
      }
    }
    return cache;
  } catch {
    return new Map();
  }
}

function saveCache(cache: Map<string, CacheEntry>): void {
  try {
    const data = Array.from(cache.entries());
    storage.set(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors; in-memory cache is enough.
  }
}

function evictOldest(cache: Map<string, CacheEntry>): void {
  if (cache.size <= MAX_CACHE) return;

  let oldest: string | null = null;
  let oldestTs = Infinity;

  for (const [key, entry] of cache) {
    if (entry.ts < oldestTs) {
      oldestTs = entry.ts;
      oldest = key;
    }
  }

  if (oldest) cache.delete(oldest);
}

let inMemoryCache: Map<string, CacheEntry> | null = null;

function getCache(): Map<string, CacheEntry> {
  if (!inMemoryCache) {
    inMemoryCache = loadCache();
  }
  return inMemoryCache;
}

function writeCache(key: string, entry: CacheEntry): void {
  const cache = getCache();
  cache.set(key, entry);
  evictOldest(cache);
  saveCache(cache);
}

export function clearGeocodeCache(): void {
  inMemoryCache = new Map();
  try {
    storage.set(STORAGE_KEY, JSON.stringify([]));
  } catch {
    // ignore
  }
}

export async function geocodeLocation(
  query: string,
  language?: string,
): Promise<MapCoordinates | null> {
  const key = normalizeQuery(query);
  const cached = getCache().get(key);
  if (cached && Date.now() - cached.ts < TTL_MS) {
    return cached.result;
  }

  const url =
    `https://nominatim.openstreetmap.org/search?` +
    `format=jsonv2&` +
    `q=${encodeURIComponent(query)}&` +
    `limit=1&` +
    `addressdetails=0`;

  try {
    const res = await trustedFetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': language || 'en',
      },
      maxRetries: 0,
      timeoutMs: TIMEOUT_MS,
    });

    if (!res.ok) {
      writeCache(key, { result: null, ts: Date.now() });
      return null;
    }

    const data = (await res.json()) as unknown;
    if (!Array.isArray(data) || data.length === 0) {
      writeCache(key, { result: null, ts: Date.now() });
      return null;
    }

    const first = data[0] as Record<string, unknown>;
    const lat = typeof first.lat === 'string' ? parseFloat(first.lat) : NaN;
    const lon = typeof first.lon === 'string' ? parseFloat(first.lon) : NaN;
    const displayName =
      typeof first.display_name === 'string' ? first.display_name : query;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      writeCache(key, { result: null, ts: Date.now() });
      return null;
    }

    const result: MapCoordinates = { lat, lon, displayName };
    writeCache(key, { result, ts: Date.now() });
    return result;
  } catch {
    return null;
  }
}
