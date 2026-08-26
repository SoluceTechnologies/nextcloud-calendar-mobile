import React, { useMemo } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import WebView from 'react-native-webview';
import { buildMapHtml } from '../utils/mapHtml';
import type { MapCoordinates } from '../types';

interface MapViewProps {
  coordinates: MapCoordinates;
  label: string;
  interactive: boolean;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'none' | 'auto' | 'box-none';
}

export function MapView({
  coordinates,
  label,
  interactive,
  style,
  pointerEvents,
}: MapViewProps) {
  const html = useMemo(
    () =>
      buildMapHtml({
        lat: coordinates.lat,
        lon: coordinates.lon,
        zoom: interactive ? 17 : 16,
        interactive,
        label,
      }),
    [coordinates, interactive, label],
  );

  return (
    <WebView
      source={{ html }}
      scrollEnabled={false}
      bounces={false}
      originWhitelist={['*']}
      overScrollMode="never"
      setBuiltInZoomControls={false}
      setDisplayZoomControls={false}
      pointerEvents={pointerEvents}
      style={style}
    />
  );
}
