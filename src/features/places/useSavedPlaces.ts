import { useEffect, useState } from 'react';

import type { SavedPlace } from '@/types';
import { useDatabase } from '@/database/DatabaseProvider';
import SavedPlaceModel from '@/database/models/SavedPlace';

export function mapPlaceToModel(p: SavedPlaceModel): SavedPlace {
  return {
    id: p.id,
    label: p.label,
    address: p.address ?? undefined,
    lat: p.lat,
    lon: p.lon,
    createdAt: p.createdAt,
  };
}

export function useSavedPlaces(): SavedPlace[] {
  const database = useDatabase();
  const [places, setPlaces] = useState<SavedPlace[]>([]);

  useEffect(() => {
    const subscription = database
      .get<SavedPlaceModel>('saved_places')
      .query()
      .observeWithColumns(['label', 'address', 'lat', 'lon'])
      .subscribe((rows) => {
        const next = rows
          .map(mapPlaceToModel)
          .sort((a, b) => a.label.localeCompare(b.label));
        setPlaces((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      });
    return () => subscription.unsubscribe();
  }, [database]);

  return places;
}
