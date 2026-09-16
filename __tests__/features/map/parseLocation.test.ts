import { parseLocation } from '@/features/map/utils/parseLocation';

describe('parseLocation', () => {
  it('parses a geo: URI', () => {
    const result = parseLocation('geo:48.8566,2.3522');
    expect(result).toEqual({ lat: 48.8566, lon: 2.3522, displayName: 'geo:48.8566,2.3522' });
  });

  it('parses a geo: URI with extra params', () => {
    const result = parseLocation('geo:48.8566,2.3522?z=16');
    expect(result).toEqual({ lat: 48.8566, lon: 2.3522, displayName: 'geo:48.8566,2.3522?z=16' });
  });

  it('parses a raw coordinate pair', () => {
    const result = parseLocation('48.8566, 2.3522');
    expect(result).toEqual({ lat: 48.8566, lon: 2.3522, displayName: '48.8566, 2.3522' });
  });

  it('extracts ll from a Google Maps URL', () => {
    const result = parseLocation('https://www.google.com/maps?q=Paris&ll=48.8566,2.3522');
    expect(result).toEqual({ lat: 48.8566, lon: 2.3522, displayName: 'Paris' });
  });

  it('extracts mlat/mlon from an OpenStreetMap URL', () => {
    const result = parseLocation('https://www.openstreetmap.org/?mlat=48.8566&mlon=2.3522&q=Paris');
    expect(result).toEqual({ lat: 48.8566, lon: 2.3522, displayName: 'Paris' });
  });

  it('returns null for a plain address', () => {
    const result = parseLocation('10 Downing Street, London');
    expect(result).toBeNull();
  });

  it('returns null for an out-of-bounds coordinate pair', () => {
    const result = parseLocation('123.456, 200.000');
    expect(result).toBeNull();
  });

  it('ignores URLs when looking for raw coordinates', () => {
    const result = parseLocation('See map at https://example.com/maps/48,2 it is there');
    expect(result).toBeNull();
  });
});
