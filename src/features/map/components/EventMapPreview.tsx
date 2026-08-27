import { useCallback } from 'react';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from 'expo-router';
import { MapView } from './MapView';
import type { MapCoordinates } from '../types';

interface EventMapPreviewProps {
  location: string;
  coordinates: MapCoordinates;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

export function EventMapPreview({
  location,
  coordinates,
  onPress,
  style,
}: EventMapPreviewProps) {
  const theme = useTheme();

  const handlePress = useCallback(() => {
    onPress();
  }, [onPress]);

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.pressable,
        { borderRadius: theme.radius.md, overflow: 'hidden' },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={location}
    >
      <MapView
        coordinates={coordinates}
        label={location}
        interactive={false}
        pointerEvents="none"
        style={styles.map}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: { height: 200, width: '100%' },
  map: { width: '100%', height: '100%' },
});
