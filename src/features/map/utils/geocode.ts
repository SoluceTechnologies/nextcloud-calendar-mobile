import { trustedFetch } from '@/services/shared/trustedFetch';
import type { MapCoordinates } from '../types';

type CacheEntry = { result: MapCoordinates | null; ts: number };

const cache = new Map<string, CacheEntry>();
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CACHE = 100;

const USER_AGENT =
  'Nextcloud Calendar Mobile (https://github.com/SoluceTechnologies/nextcloud-calendar-mobile)';

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

function evictOldest(): void {
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

export function clearGeocodeCache(): void {
  cache.clear();
}

export async function geocodeLocation(
  query: string,
  language?: string,
): Promise<MapCoordinates | null> {
  const key = normalizeQuery(query);
  const cached = cache.get(key);
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
    });

    if (!res.ok) return null;

    const data = (await res.json()) as unknown;
    if (!Array.isArray(data) || data.length === 0) return null;

    const first = data[0] as Record<string, unknown>;
    const lat = typeof first.lat === 'string' ? parseFloat(first.lat) : NaN;
    const lon = typeof first.lon === 'string' ? parseFloat(first.lon) : NaN;
    const displayName =
      typeof first.display_name === 'string' ? first.display_name : query;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const result: MapCoordinates = { lat, lon, displayName };
    evictOldest();
    cache.set(key, { result, ts: Date.now() });
    return result;
  } catch {
    return null;
  }
}
