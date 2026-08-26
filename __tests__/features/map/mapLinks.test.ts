import { Platform } from 'react-native';
import { openMapsUrl } from '@/features/map/utils/mapLinks';

describe('openMapsUrl', () => {
  let originalOs: string;

  beforeEach(() => {
    originalOs = Platform.OS;
  });

  afterEach(() => {
    (Platform as { OS: string }).OS = originalOs;
  });

  it('builds iOS URL with coordinates', () => {
    (Platform as { OS: string }).OS = 'ios';
    expect(openMapsUrl('Paris', 48.8566, 2.3522)).toBe(
      'http://maps.apple.com/?q=Paris&ll=48.8566,2.3522',
    );
  });

  it('builds Android URL with coordinates', () => {
    (Platform as { OS: string }).OS = 'android';
    expect(openMapsUrl('Paris', 48.8566, 2.3522)).toBe(
      'geo:48.8566,2.3522?q=48.8566,2.3522(Paris)',
    );
  });

  it('builds iOS URL without coordinates', () => {
    (Platform as { OS: string }).OS = 'ios';
    expect(openMapsUrl('Paris')).toBe('http://maps.apple.com/?q=Paris');
  });

  it('builds Android URL without coordinates', () => {
    (Platform as { OS: string }).OS = 'android';
    expect(openMapsUrl('Paris')).toBe('geo:0,0?q=Paris');
  });
});
