import { useCallback } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from 'expo-router';
import { displayLocation } from '@/features/widget/core/liveEvent';
import { MapView } from './MapView';
import { openMaps } from '../utils/mapLinks';
import type { MapCoordinates } from '../types';

interface EventMapSheetProps {
  visible: boolean;
  onClose: () => void;
  location: string;
  coordinates: MapCoordinates;
}

export function EventMapSheet({
  visible,
  onClose,
  location,
  coordinates,
}: EventMapSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const handleOpenMaps = useCallback(async () => {
    await openMaps(location, coordinates.lat, coordinates.lon);
  }, [location, coordinates]);

  const title = displayLocation(location) || location;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.colors.surface,
            paddingTop: insets.top,
          },
        ]}
      >
        <MapView
          coordinates={coordinates}
          label={title}
          interactive
          showChrome
          style={styles.map}
          bottomInset={insets.bottom}
          onClose={onClose}
          onOpenMaps={handleOpenMaps}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
});
