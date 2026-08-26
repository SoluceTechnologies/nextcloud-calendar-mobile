import { useCallback } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';
import { Map as MapIcon, X } from 'lucide-react-native';
import { useTheme } from 'expo-router';
import { displayLocation } from '@/features/widget/core/liveEvent';
import { ScreenHeader, IconButton } from '@/ui/components';
import { MapView } from './MapView';
import { openMapsUrl } from '../utils/mapLinks';
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
  const { t } = useTranslation();

  const handleOpenMaps = useCallback(() => {
    const url = openMapsUrl(location, coordinates.lat, coordinates.lon);
    Linking.openURL(url).catch(() => {});
  }, [location, coordinates]);

  const title = displayLocation(location) || location;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.colors.card, paddingBottom: insets.bottom },
          ]}
        >
          <ScreenHeader
            title={title}
            left={
              <IconButton
                variant="ghost"
                round
                size={40}
                onPress={onClose}
                accessibilityLabel={t('common.close')}
              >
                <X size={22} color={theme.colors.text} />
              </IconButton>
            }
            right={
              <IconButton
                variant="ghost"
                round
                size={40}
                onPress={handleOpenMaps}
                accessibilityLabel={t('event.openInMaps')}
              >
                <MapIcon size={22} color={theme.colors.primary} />
              </IconButton>
            }
          />
          <MapView
            coordinates={coordinates}
            label={location}
            interactive
            style={styles.map}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
});
