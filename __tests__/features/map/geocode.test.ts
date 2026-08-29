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
    expect(url).toContain('limit=1');
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
});
