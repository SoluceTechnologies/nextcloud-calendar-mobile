import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from 'expo-router';
import WebView from 'react-native-webview';
import { Spinner } from '@/ui/components';
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
  const theme = useTheme();
  const mapBackground = theme.colors.surface;

  const html = useMemo(
    () =>
      buildMapHtml({
        lat: coordinates.lat,
        lon: coordinates.lon,
        zoom: interactive ? 17 : 16,
        interactive,
        label,
        isDark: theme.dark,
        markerColor: theme.colors.primary,
        backgroundColor: mapBackground,
      }),
    [coordinates, interactive, label, mapBackground, theme.colors.primary, theme.dark],
  );

  return (
    <View
      style={[styles.container, { backgroundColor: mapBackground }, style]}
      pointerEvents="box-none"
    >
      <WebView
        source={{ html }}
        scrollEnabled={false}
        bounces={false}
        originWhitelist={['*']}
        overScrollMode="never"
        setBuiltInZoomControls={false}
        setDisplayZoomControls={false}
        pointerEvents={pointerEvents ?? 'auto'}
        style={styles.webview}
        startInLoadingState
        renderLoading={() => (
          <View style={[styles.loader, { backgroundColor: mapBackground }]}>
            <Spinner size="small" />
          </View>
        )}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  webview: { width: '100%', height: '100%', backgroundColor: 'transparent' },
  loader: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
