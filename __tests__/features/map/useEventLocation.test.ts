import { renderHook, waitFor } from '@testing-library/react-native';
import { useEventLocation } from '@/features/map/hooks/useEventLocation';
import { clearGeocodeCache } from '@/features/map/utils/geocode';

beforeEach(() => {
  clearGeocodeCache();
  jest.restoreAllMocks();
});

describe('useEventLocation', () => {
  it('returns virtual=true for a Talk URL', async () => {
    const { result } = renderHook(() =>
      useEventLocation('https://cloud.example.com/call/abc'),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isVirtual).toBe(true);
    expect(result.current.coordinates).toBeNull();
  });

  it('parses a geo: URI directly', async () => {
    const { result } = renderHook(() => useEventLocation('geo:48.8566,2.3522'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isVirtual).toBe(false);
    expect(result.current.coordinates).toEqual({
      lat: 48.8566,
      lon: 2.3522,
      displayName: 'geo:48.8566,2.3522',
    });
  });

  it('geocodes a plain address', async () => {
    const fetchSpy = jest.spyOn(globalThis as any, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          { place_id: 1, lat: '48.8566', lon: '2.3522', display_name: 'Paris, France' },
        ]),
      headers: { forEach: () => {} },
    } as unknown as Response);

    const { result } = renderHook(() => useEventLocation('Paris'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isVirtual).toBe(false);
    expect(result.current.coordinates).toEqual({
      lat: 48.8566,
      lon: 2.3522,
      displayName: 'Paris, France',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns null coordinates when geocoding fails', async () => {
    jest.spyOn(globalThis as any, 'fetch').mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useEventLocation('UnknownXYZ'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isVirtual).toBe(false);
    expect(result.current.coordinates).toBeNull();
  });

  it('returns null for an undefined location', async () => {
    const { result } = renderHook(() => useEventLocation(undefined));
    expect(result.current.isVirtual).toBe(false);
    expect(result.current.coordinates).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
