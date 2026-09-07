import { stripUrls } from '@/features/widget/core/liveEvent';
import type { MapCoordinates } from '../types';

function parseCoordPair(text: string): { lat: number; lon: number } | null {
  const match = /(-?\d{1,3}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:\.\d+)?)/.exec(text);
  if (!match) return null;

  const lat = parseFloat(match[1]);
  const lon = parseFloat(match[2]);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  return { lat, lon };
}

export function parseLocation(input: string): MapCoordinates | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const geoMatch = /^geo:([-\d.]+),([-\d.]+)/i.exec(trimmed);
  if (geoMatch) {
    const lat = parseFloat(geoMatch[1]);
    const lon = parseFloat(geoMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return { lat, lon, displayName: trimmed };
    }
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const ll =
        url.searchParams.get('ll') ||
        url.searchParams.get('query') ||
        url.searchParams.get('q') ||
        '';
      const coords = parseCoordPair(ll);
      if (coords) {
        return { ...coords, displayName: url.searchParams.get('q') || trimmed };
      }

      const mlat = url.searchParams.get('mlat');
      const mlon = url.searchParams.get('mlon');
      if (mlat && mlon) {
        const lat = parseFloat(mlat);
        const lon = parseFloat(mlon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          return { lat, lon, displayName: url.searchParams.get('q') || trimmed };
        }
      }
    } catch {
      // Ignore malformed URLs.
    }
  }

  const cleaned = stripUrls(trimmed).replace(/\s+/g, ' ').trim();
  const coords = parseCoordPair(cleaned);
  if (coords) {
    return { ...coords, displayName: cleaned };
  }

  return null;
}
