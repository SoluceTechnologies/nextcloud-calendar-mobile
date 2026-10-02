import type { StyleProp, ViewStyle } from 'react-native';

export interface QrScannerViewProps {
  style?: StyleProp<ViewStyle>;
  paused?: boolean;
  torch?: boolean;
  onScanned: (data: string) => void;
}

export interface CameraPermission {
  status: 'granted' | 'denied' | 'undetermined';
  granted: boolean;
  canAskAgain: boolean;
  expires: 'never' | number;
}

export type UseCameraPermissions = () => [
  CameraPermission | null,
  () => Promise<CameraPermission>,
];
