import { requireNativeView } from 'expo';
import type { StyleProp, ViewStyle } from 'react-native';

import type { QrScannerViewProps } from './QrScannerView.types';

interface NativeProps {
  style?: StyleProp<ViewStyle>;
  paused?: boolean;
  torch?: boolean;
  onBarcodeScanned?: (event: { nativeEvent: { data: string } }) => void;
}

const NativeView = requireNativeView<NativeProps>('ZxingScanner');

export function QrScannerView({ onScanned, ...rest }: QrScannerViewProps) {
  return (
    <NativeView
      {...rest}
      onBarcodeScanned={({ nativeEvent }) => onScanned(nativeEvent.data)}
    />
  );
}
