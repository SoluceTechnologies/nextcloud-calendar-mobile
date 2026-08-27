import React, { useCallback, useMemo } from 'react';
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
  bottomInset?: number;
  showChrome?: boolean;
  onClose?: () => void;
  onOpenMaps?: () => void;
}

export function MapView({
  coordinates,
  label,
  interactive,
  style,
  pointerEvents,
  bottomInset = 0,
  showChrome,
  onClose,
  onOpenMaps,
}: MapViewProps) {
  const theme = useTheme();
  const mapBackground = theme.colors.surface;

  const html = useMemo(
    () =>
      buildMapHtml({
        lat: coordinates.lat,
        lon: coordinates.lon,
        zoom: interactive ? 17 : 15,
        interactive,
        label,
        isDark: theme.dark,
        markerColor: theme.colors.primary,
        backgroundColor: mapBackground,
        bottomInset,
        showChrome,
        textColor: theme.colors.text,
      }),
    [coordinates, interactive, label, mapBackground, theme.colors.primary, theme.dark, bottomInset, showChrome, theme.colors.text],
  );

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      const action = event.nativeEvent.data;
      if (action === 'close') onClose?.();
      else if (action === 'openMaps') onOpenMaps?.();
    },
    [onClose, onOpenMaps],
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
        contentInset={{ top: 0, left: 0, bottom: 0, right: 0 }}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        onMessage={handleMessage}
        androidLayerType={interactive ? undefined : 'software'}
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
