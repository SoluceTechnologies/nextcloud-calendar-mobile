import { ActionSheetIOS, Linking, Platform } from 'react-native';
import { openMaps, openMapsUrl } from '@/features/map/utils/mapLinks';

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

describe('openMaps', () => {
  let originalOs: string;
  let canOpenSpy: jest.SpyInstance;
  let openUrlSpy: jest.SpyInstance;
  let showSheetSpy: jest.SpyInstance;

  beforeEach(() => {
    originalOs = Platform.OS;
    jest.clearAllMocks();
    canOpenSpy = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    showSheetSpy = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});
  });

  afterEach(() => {
    (Platform as { OS: string }).OS = originalOs;
    canOpenSpy.mockRestore();
    openUrlSpy.mockRestore();
    showSheetSpy.mockRestore();
  });

  it('opens the Android URL directly', async () => {
    (Platform as { OS: string }).OS = 'android';
    await openMaps('Paris', 48.8566, 2.3522);
    expect(Linking.openURL).toHaveBeenCalledWith(
      'geo:48.8566,2.3522?q=48.8566,2.3522(Paris)',
    );
  });

  it('opens Apple Maps directly when no other app is installed', async () => {
    (Platform as { OS: string }).OS = 'ios';
    await openMaps('Paris', 48.8566, 2.3522);
    expect(Linking.openURL).toHaveBeenCalledWith(
      'http://maps.apple.com/?q=Paris&ll=48.8566,2.3522',
    );
    expect(ActionSheetIOS.showActionSheetWithOptions).not.toHaveBeenCalled();
  });

  it('shows an action sheet when Google Maps is also installed', async () => {
    (Platform as { OS: string }).OS = 'ios';
    canOpenSpy.mockImplementation((url: string) =>
      Promise.resolve(typeof url === 'string' && url.startsWith('comgooglemaps')),
    );

    const promise = openMaps('Paris', 48.8566, 2.3522);
    await new Promise<void>((resolve) => setImmediate(() => resolve()));
    expect(ActionSheetIOS.showActionSheetWithOptions).toHaveBeenCalled();

    const [, callback] = (ActionSheetIOS.showActionSheetWithOptions as jest.Mock).mock.calls[0];
    callback(1); // Google Maps option
    await promise;

    expect(Linking.openURL).toHaveBeenCalledWith(expect.stringContaining('comgooglemaps'));
  });
});
