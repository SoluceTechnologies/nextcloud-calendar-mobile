import type { SavedPlace } from '@/types';

const MAX_SUGGESTIONS = 5;

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Offline-first location suggestions: saved places whose label or address
 * contains the typed query. Prefix matches on the label rank first.
 */
export function matchPlaces(query: string, places: SavedPlace[]): SavedPlace[] {
  const q = normalize(query);
  if (q.length === 0) return [];

  const scored: Array<{ place: SavedPlace; rank: number }> = [];
  for (const place of places) {
    const label = normalize(place.label);
    const address = normalize(place.address ?? '');
    if (label.startsWith(q)) {
      scored.push({ place, rank: 0 });
    } else if (label.includes(q)) {
      scored.push({ place, rank: 1 });
    } else if (address.includes(q)) {
      scored.push({ place, rank: 2 });
    }
  }

  return scored
    .sort((a, b) => a.rank - b.rank || a.place.label.localeCompare(b.place.label))
    .slice(0, MAX_SUGGESTIONS)
    .map((s) => s.place);
}
