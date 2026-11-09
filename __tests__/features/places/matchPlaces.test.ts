import { matchPlaces } from '@/features/places/matchPlaces';
import type { SavedPlace } from '@/types';

const places: SavedPlace[] = [
  { id: '1', label: 'Bureau', address: '12 rue de la Paix, Nantes', lat: 47.2, lon: -1.55, createdAt: 1 },
  { id: '2', label: 'Maison', lat: 48.85, lon: 2.35, createdAt: 2 },
  { id: '3', label: 'Bureau annexe', address: 'Lyon', lat: 45.76, lon: 4.83, createdAt: 3 },
  { id: '4', label: 'Salle Vega', address: 'Bureau Sud', lat: 47.0, lon: -1.5, createdAt: 4 },
];

describe('matchPlaces', () => {
  it('returns nothing for an empty query', () => {
    expect(matchPlaces('', places)).toEqual([]);
    expect(matchPlaces('   ', places)).toEqual([]);
  });

  it('matches on label prefix first, then substring', () => {
    const result = matchPlaces('bur', places);
    expect(result.map((p) => p.label)).toEqual(['Bureau', 'Bureau annexe', 'Salle Vega']);
  });

  it('is case and accent insensitive', () => {
    expect(matchPlaces('BUREAU', places).map((p) => p.id)).toContain('1');
    expect(matchPlaces('véga', places).map((p) => p.label)).toEqual(['Salle Vega']);
  });

  it('matches on address when the label does not match', () => {
    const result = matchPlaces('lyon', places);
    expect(result).toEqual([places[2]]);
  });

  it('limits results to 5 suggestions', () => {
    const many: SavedPlace[] = Array.from({ length: 8 }, (_, i) => ({
      id: `m${i}`, label: `Lieu ${i}`, lat: 0, lon: 0, createdAt: i,
    }));
    expect(matchPlaces('lieu', many)).toHaveLength(5);
  });
});
