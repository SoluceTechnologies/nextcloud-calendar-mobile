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

type NominatimResult = {
  lat?: unknown;
  lon?: unknown;
  display_name?: unknown;
  importance?: unknown;
  address?: Record<string, unknown>;
};

const MIN_IMPORTANCE = 0.35;
const MIN_TOKEN_COVERAGE = 0.6;
const SAME_AREA_KM = 50;

const PLACE_FIELDS = [
  'city',
  'town',
  'village',
  'municipality',
  'county',
  'state',
  'region',
  'suburb',
  'city_district',
  'postcode',
  'country',
];

function tokenize(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function spreadKm(points: Array<{ lat: number; lon: number }>): number {
  let max = 0;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const dLat = points[i].lat - points[j].lat;
      const dLon = (points[i].lon - points[j].lon) * Math.cos((points[i].lat * Math.PI) / 180);
      max = Math.max(max, Math.hypot(dLat, dLon) * 111);
    }
  }
  return max;
}

export function isRealAddressMatch(
  query: string,
  top: NominatimResult,
  points: Array<{ lat: number; lon: number }>,
): boolean {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return false;

  const matched = new Set(tokenize(String(top.display_name ?? '')));
  const covered = queryTokens.filter((token) => matched.has(token)).length;
  if (covered / queryTokens.length < MIN_TOKEN_COVERAGE) return false;

  const importance = typeof top.importance === 'number' ? top.importance : 0;
  if (importance >= MIN_IMPORTANCE) return true;

  const address = top.address ?? {};
  const areaTokens = new Set(
    PLACE_FIELDS.flatMap((field) => tokenize(String(address[field] ?? ''))),
  );
  if (queryTokens.some((token) => areaTokens.has(token))) return true;

  return spreadKm(points) <= SAME_AREA_KM;
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
    `limit=5&` +
    `addressdetails=1`;

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

    const candidates = (data as NominatimResult[]).map((entry) => ({
      entry,
      lat: typeof entry.lat === 'string' ? parseFloat(entry.lat) : NaN,
      lon: typeof entry.lon === 'string' ? parseFloat(entry.lon) : NaN,
    }));
    const points = candidates.filter(
      (c) => Number.isFinite(c.lat) && Number.isFinite(c.lon),
    );

    const first = candidates[0];
    const { lat, lon } = first;
    const displayName =
      typeof first.entry.display_name === 'string' ? first.entry.display_name : query;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      writeCache(key, { result: null, ts: Date.now() });
      return null;
    }

    if (!isRealAddressMatch(query, first.entry, points)) {
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
