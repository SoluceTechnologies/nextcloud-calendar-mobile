import { hasExpoCamera } from './hasExpoCamera';
import type { UseCameraPermissions } from './QrScannerView.types';

export const useQrCameraPermissions: UseCameraPermissions = hasExpoCamera
  ? require('./useExpoCameraPermissions').useQrCameraPermissions
  : require('./useZxingCameraPermissions').useQrCameraPermissions;
