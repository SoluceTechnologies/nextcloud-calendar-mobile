import { CameraView } from 'expo-camera';

import type { QrScannerViewProps } from './QrScannerView.types';


export function QrScannerView({ style, paused, torch, onScanned }: QrScannerViewProps) {
  return (
    <CameraView
      style={style}
      facing="back"
      enableTorch={torch}
      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      onBarcodeScanned={paused ? undefined : ({ data }) => onScanned(data)}
    />
  );
}
