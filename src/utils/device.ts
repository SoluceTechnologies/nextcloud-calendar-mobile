import { Dimensions } from 'react-native';

export function isTablet(): boolean {
  const { width, height } = Dimensions.get('window');
  return Math.min(width, height) >= 600;
}
