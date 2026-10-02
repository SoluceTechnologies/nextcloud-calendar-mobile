import { requireNativeModule } from 'expo';
import { useCallback, useEffect, useState } from 'react';

import type { CameraPermission } from './QrScannerView.types';

interface ZxingScannerNativeModule {
  getCameraPermissionsAsync(): Promise<CameraPermission>;
  requestCameraPermissionsAsync(): Promise<CameraPermission>;
}

const ZxingScanner = requireNativeModule<ZxingScannerNativeModule>('ZxingScanner');

export function useQrCameraPermissions(): [
  CameraPermission | null,
  () => Promise<CameraPermission>,
] {
  const [permission, setPermission] = useState<CameraPermission | null>(null);

  useEffect(() => {
    let cancelled = false;
    ZxingScanner.getCameraPermissionsAsync().then((next) => {
      if (!cancelled) setPermission(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const request = useCallback(async () => {
    const next = await ZxingScanner.requestCameraPermissionsAsync();
    setPermission(next);
    return next;
  }, []);

  return [permission, request];
}
