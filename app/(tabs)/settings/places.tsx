import React, { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import * as ExpoLocation from 'expo-location';
import { LocateFixed, MapPin, Trash2 } from 'lucide-react-native';

import { useSettingsStore } from '@/stores/settingsStore';
import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { useSavedPlaces } from '@/features/places/useSavedPlaces';
import { addSavedPlace, deleteSavedPlace } from '@/features/places/actions';
import { geocodeLocation, reverseGeocode } from '@/features/map/utils/geocode';
import {
  Button, Icon, Item, List, SectionHeader, Spinner, Stack, TextField, Typography,
} from '@/ui/components';

const cardOuter = { marginHorizontal: 16, marginBottom: 12 };

export default function PlacesSettingsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const language = useSettingsStore((s) => s.language);
  const places = useSavedPlaces();

  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  async function useCurrentLocation() {
    setLocating(true);
    try {
      const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('event.locationPermissionDenied'));
        return;
      }
      const pos = await ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy.Balanced,
      });
      const { latitude, longitude } = pos.coords;
      setPendingCoords({ lat: latitude, lon: longitude });
      const name = await reverseGeocode(latitude, longitude, language);
      setAddress(name ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
    } catch {
      Alert.alert(t('event.locationUnavailable'));
    } finally {
      setLocating(false);
    }
  }

  async function save() {
    const trimmed = label.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      let coords = pendingCoords;
      if (!coords && address.trim()) {
        const result = await geocodeLocation(address.trim(), language);
        if (result) coords = { lat: result.lat, lon: result.lon };
      }
      if (!coords) {
        Alert.alert(t('settings.places.noPosition'));
        return;
      }
      await addSavedPlace({
        label: trimmed,
        lat: coords.lat,
        lon: coords.lon,
        address: address.trim() || undefined,
      });
      setLabel('');
      setAddress('');
      setPendingCoords(null);
    } catch {
      Alert.alert(t('settings.places.saveError'));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(id: string, name: string) {
    Alert.alert(
      t('settings.places.deleteTitle'),
      t('settings.places.deleteBody', { name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => { void deleteSavedPlace(id); },
        },
      ],
    );
  }

  return (
    <SettingsPage title={t('settings.places.title')}>
      <Stack card gap={12} padding={16} hAlign="stretch" style={cardOuter}>
        <Typography variant="body1">{t('settings.places.addTitle')}</Typography>
        <TextField
          testID="place-form-label"
          label={t('settings.places.label')}
          value={label}
          onChangeText={setLabel}
          placeholder={t('settings.places.labelPlaceholder')}
        />
        <TextField
          testID="place-form-address"
          label={t('settings.places.address')}
          value={address}
          onChangeText={(text) => { setAddress(text); setPendingCoords(null); }}
          placeholder={t('settings.places.addressPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          right={locating ? <Spinner /> : undefined}
        />
        <Stack direction="horizontal" gap={8}>
          <Button
            testID="place-form-locate"
            variant="secondary"
            title={t('event.useMyLocation')}
            onPress={useCurrentLocation}
            disabled={locating || saving}
            icon={locating ? undefined : <LocateFixed size={16} color={colors.primary} />}
          />
          <Button
            testID="place-form-save"
            variant="primary"
            title={t('common.save')}
            onPress={save}
            disabled={!label.trim() || saving}
          />
        </Stack>
        {pendingCoords ? (
          <Typography variant="caption" color="secondary">
            {`${pendingCoords.lat.toFixed(5)}, ${pendingCoords.lon.toFixed(5)}`}
          </Typography>
        ) : null}
      </Stack>

      <Stack style={styles.section} hAlign="stretch">
        <SectionHeader title={t('settings.places.savedTitle')} />
        <List>
          {places.length === 0 ? (
            <Item
              title={<Typography variant="body2" color="secondary">{t('settings.places.empty')}</Typography>}
            />
          ) : (
            places.map((place) => (
              <Item
                key={place.id}
                testID={`saved-place-${place.id}`}
                leading={<Icon color={colors.primary} size={20}><MapPin /></Icon>}
                title={<Typography variant="body1" numberOfLines={1}>{place.label}</Typography>}
                description={
                  <Typography variant="caption" color="secondary" numberOfLines={1}>
                    {place.address ?? `${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`}
                  </Typography>
                }
                trailing={
                  <Trash2
                    size={18}
                    color={colors.danger}
                    onPress={() => confirmDelete(place.id, place.label)}
                    testID={`saved-place-delete-${place.id}`}
                  />
                }
              />
            ))
          )}
        </List>
      </Stack>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24, marginHorizontal: 16 },
});
