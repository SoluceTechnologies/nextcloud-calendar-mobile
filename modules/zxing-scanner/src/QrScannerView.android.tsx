import type { ComponentType } from 'react';

import { hasExpoCamera } from './hasExpoCamera';
import type { QrScannerViewProps } from './QrScannerView.types';

export const QrScannerView: ComponentType<QrScannerViewProps> = hasExpoCamera
  ? require('./ExpoCameraQrScannerView').QrScannerView
  : require('./ZxingQrScannerView').QrScannerView;
