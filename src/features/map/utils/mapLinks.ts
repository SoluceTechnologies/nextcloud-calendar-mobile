import { Platform } from 'react-native';

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
