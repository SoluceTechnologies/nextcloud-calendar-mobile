import { database } from '@/database';
import SavedPlaceModel from '@/database/models/SavedPlace';

export async function addSavedPlace(input: {
  label: string;
  lat: number;
  lon: number;
  address?: string;
}): Promise<SavedPlaceModel> {
  return database.write(async () =>
    database.get<SavedPlaceModel>('saved_places').create((place) => {
      place.label = input.label;
      place.address = input.address;
      place.lat = input.lat;
      place.lon = input.lon;
      place.createdAt = Date.now();
    }),
  );
}

export async function deleteSavedPlace(id: string): Promise<void> {
  const place = await database.get<SavedPlaceModel>('saved_places').find(id);
  await database.write(() => place.destroyPermanently());
}
