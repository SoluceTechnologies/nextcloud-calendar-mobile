import { ActionSheetIOS, Linking, Platform } from 'react-native';
import i18n from '@/utils/i18n';

export interface MapAppOption {
  name: string;
  url: string;
}

export function openMapsUrl(query: string, lat?: number, lon?: number): string {
  const encodedQuery = encodeURIComponent(query);

  if (lat !== undefined && lon !== undefined) {
    if (Platform.OS === 'ios') {
      return `http://maps.apple.com/?q=${encodedQuery}&ll=${lat},${lon}`;
    }
    return `geo:${lat},${lon}?q=${lat},${lon}(${encodedQuery})`;
  }

  if (Platform.OS === 'ios') {
    return `http://maps.apple.com/?q=${encodedQuery}`;
  }

  return `geo:0,0?q=${encodedQuery}`;
}

function buildIosOptions(query: string, lat?: number, lon?: number): MapAppOption[] {
  const encodedQuery = encodeURIComponent(query);
  const appleUrl = openMapsUrl(query, lat, lon);

  const googleUrl =
    lat !== undefined && lon !== undefined
      ? `comgooglemaps://?q=${encodedQuery}&center=${lat},${lon}`
      : `comgooglemaps://?q=${encodedQuery}`;

  const wazeUrl =
    lat !== undefined && lon !== undefined
      ? `waze://?ll=${lat},${lon}`
      : `waze://?q=${encodedQuery}`;

  return [
    { name: 'Apple Maps', url: appleUrl },
    { name: 'Google Maps', url: googleUrl },
    { name: 'Waze', url: wazeUrl },
  ];
}

async function canOpen(url: string): Promise<boolean> {
  try {
    return await Linking.canOpenURL(url);
  } catch {
    return false;
  }
}

export async function openMaps(query: string, lat?: number, lon?: number): Promise<void> {
  if (Platform.OS !== 'ios') {
    const url = openMapsUrl(query, lat, lon);
    await Linking.openURL(url).catch(() => {});
    return;
  }

  const allOptions = buildIosOptions(query, lat, lon);
  const options = [allOptions[0]];

  const [googleAvailable, wazeAvailable] = await Promise.all([
    canOpen(allOptions[1].url),
    canOpen(allOptions[2].url),
  ]);

  if (googleAvailable) options.push(allOptions[1]);
  if (wazeAvailable) options.push(allOptions[2]);

  if (options.length === 1) {
    await Linking.openURL(options[0].url).catch(() => {});
    return;
  }

  const labels = options.map((o) => o.name);
  const cancel = i18n.t('common.cancel');
  labels.push(cancel);
  const cancelButtonIndex = labels.length - 1;

  return new Promise<void>((resolve) => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: i18n.t('event.openInMaps'),
        options: labels,
        cancelButtonIndex,
      },
      async (buttonIndex) => {
        if (buttonIndex === cancelButtonIndex) {
          resolve();
          return;
        }
        const selected = options[buttonIndex];
        if (selected) {
          await Linking.openURL(selected.url).catch(() => {});
        }
        resolve();
      },
    );
  });
}
