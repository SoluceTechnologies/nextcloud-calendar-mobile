import { clearGeocodeCache, geocodeLocation } from '@/features/map/utils/geocode';

describe('geocodeLocation', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    clearGeocodeCache();
    fetchSpy = jest.spyOn(globalThis as any, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          {
            place_id: 1,
            lat: '48.8566',
            lon: '2.3522',
            display_name: 'Paris, France',
          },
        ]),
      headers: { forEach: () => {} },
    } as unknown as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns coordinates from Nominatim and caches the result', async () => {
    const result = await geocodeLocation('Paris');
    expect(result).toEqual({ lat: 48.8566, lon: 2.3522, displayName: 'Paris, France' });

    const second = await geocodeLocation('Paris');
    expect(second).toEqual(result);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toMatch(/^https:\/\/nominatim.openstreetmap.org\/search/);
    expect(url).toContain('q=Paris');
    expect(url).toContain('limit=5');
    expect(url).toContain('addressdetails=1');
  });

  it('passes Accept-Language header', async () => {
    await geocodeLocation('Paris', 'fr');
    const init = fetchSpy.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers['Accept-Language']).toBe('fr');
    expect(init.headers['User-Agent']).toContain('Nextcloud Calendar Mobile');
  });

  it('returns null when Nominatim returns an empty array', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
      headers: { forEach: () => {} },
    } as unknown as Response);

    const result = await geocodeLocation('UnknownPlaceXYZ');
    expect(result).toBeNull();
  });

  it('returns null when the request fails', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network error'));
    const result = await geocodeLocation('Paris');
    expect(result).toBeNull();
  });

  it('returns null for invalid coordinate strings in response', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ lat: 'foo', lon: 'bar' }]),
      headers: { forEach: () => {} },
    } as unknown as Response);

    const result = await geocodeLocation('Paris');
    expect(result).toBeNull();
  });
  it('rejects a generic room name that resolves to scattered, unimportant places', async () => {
    // Real Nominatim shape for "salle de reunion": buildings in Niger, Chad and Paris.
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          {
            lat: '13.5041199',
            lon: '2.0825625',
            display_name: 'Salle de Reunion (FSS), Avenue Professeur Hamidou Sekou, Niamey, Niger',
            importance: 0.000065,
            address: { city: 'Niamey', country: 'Niger' },
          },
          {
            lat: '13.6443542',
            lon: '16.4931505',
            display_name: 'Salle de Reunion, Moussoro, Barh el Gazel, Tchad',
            importance: 0.0000375,
            address: { city: 'Moussoro', country: 'Tchad' },
          },
        ]),
      headers: { forEach: () => {} },
    } as unknown as Response);

    expect(await geocodeLocation('salle de reunion')).toBeNull();
  });

  it('rejects a fuzzy match that drops the query words', async () => {
    // "Room 301" resolves to Rome, Italy: high importance, but nothing we asked for.
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          {
            lat: '41.8933203',
            lon: '12.4829321',
            display_name: 'Rome, Roma Capitale, Latium, Italie',
            importance: 0.856,
            address: { city: 'Rome', country: 'Italie' },
          },
        ]),
      headers: { forEach: () => {} },
    } as unknown as Response);

    expect(await geocodeLocation('Room 301')).toBeNull();
  });

  it('accepts a well-known place', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          {
            lat: '48.8582599',
            lon: '2.2945006',
            display_name: 'Tour Eiffel, 5, Avenue Anatole France, Paris, France',
            importance: 0.62,
            address: { city: 'Paris', country: 'France' },
          },
        ]),
      headers: { forEach: () => {} },
    } as unknown as Response);

    expect(await geocodeLocation('Tour Eiffel')).not.toBeNull();
  });

  it('accepts a street address repeated in several cities when the query names the city', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          {
            lat: '38.8976763',
            lon: '-77.0365298',
            display_name: '1600, Pennsylvania Avenue Northwest, Washington, 20500, United States',
            importance: 0.00001,
            address: { house_number: '1600', road: 'Pennsylvania Avenue Northwest', city: 'Washington' },
          },
          {
            lat: '40.4404',
            lon: '-79.9961',
            display_name: '1600, Pennsylvania Avenue, Pittsburgh, 15233, United States',
            importance: 0.00001,
            address: { house_number: '1600', road: 'Pennsylvania Avenue', city: 'Pittsburgh' },
          },
        ]),
      headers: { forEach: () => {} },
    } as unknown as Response);

    const result = await geocodeLocation('1600 Pennsylvania Avenue, Washington');
    expect(result?.lat).toBeCloseTo(38.8976763);
  });
});
