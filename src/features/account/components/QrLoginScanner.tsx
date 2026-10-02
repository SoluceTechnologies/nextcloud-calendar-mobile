import { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import { X } from 'lucide-react-native';

import { IconButton, ScreenHeader } from '@/ui/components';

import { QrScannerView } from '../../../../modules/zxing-scanner/src/QrScannerView';
import { useQrCameraPermissions } from '../../../../modules/zxing-scanner/src/useQrCameraPermissions';

import { parseNcLoginUrl } from '../utils/ncLoginUrl';
import type { NcLoginData } from '../utils/ncLoginUrl';

export type { NcLoginData };

interface Props {
  visible: boolean;
  onClose: () => void;
  onScanned: (data: NcLoginData) => void;
}

export function QrLoginScanner({ visible, onClose, onScanned }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [permission, requestPermission] = useQrCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const scannedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setScanned(false);
      setParseError(null);
      scannedRef.current = false;
    }
  }, [visible]);

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [visible, permission, requestPermission]);

  function handleBarCodeScanned(data: string) {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setScanned(true);

    const parsed = parseNcLoginUrl(data);
    if (!parsed) {
      setParseError(t('setup.qrInvalidCode'));
      scannedRef.current = false;
      setScanned(false);
      return;
    }
    onScanned(parsed);
  }

  if (!visible) return null;

  if (!permission || (!permission.granted && permission.canAskAgain)) {
    return (
      <Modal visible animationType="slide" onRequestClose={onClose}>
        <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible animationType="slide" onRequestClose={onClose}>
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
          <ScreenHeader
            left={
              <IconButton variant="ghost" round size={40} onPress={onClose} accessibilityLabel={t('common.close')}>
                <X size={22} color={theme.colors.text} />
              </IconButton>
            }
          />
          <View style={styles.center}>
            <Text style={[styles.permText, { color: theme.colors.text }]}>
              {t('setup.qrCameraDenied')}
            </Text>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: theme.colors.primary }]}
              onPress={() => Linking.openSettings()}
            >
              <Text style={styles.btnText}>{t('setup.qrOpenSettings')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <QrScannerView
          style={StyleSheet.absoluteFill}
          paused={scanned}
          onScanned={handleBarCodeScanned}
        />

        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.dimTop} />
          <View style={styles.middle}>
            <View style={styles.dimSide} />
            <View style={styles.scanBox} />
            <View style={styles.dimSide} />
          </View>
          <View style={styles.dimBottom} />
        </View>

        <View style={styles.header}>
          <IconButton variant="plain" glass round size={40} onPress={onClose} accessibilityLabel={t('common.close')}>
            <X size={22} color="#fff" />
          </IconButton>
        </View>

        <View style={styles.footer}>
          {parseError ? (
            <>
              <Text style={styles.errorText}>{parseError}</Text>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: theme.colors.primary, marginTop: 12 }]}
                onPress={() => { scannedRef.current = false; setScanned(false); setParseError(null); }}
              >
                <Text style={styles.btnText}>{t('setup.qrTryAgain')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.hintText}>
              {t('setup.qrHint')}
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const BOX = 240;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  overlay: { ...StyleSheet.absoluteFill },
  dimTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  middle: { flexDirection: 'row', height: BOX },
  dimSide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  scanBox: {
    width: BOX,
    height: BOX,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 12,
  },
  dimBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: 24, alignItems: 'center',
    paddingBottom: 48,
  },
  hintText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  errorText: { color: '#ff6b6b', fontSize: 14, textAlign: 'center' },
  permText: { fontSize: 16, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  btn: { borderRadius: 10, paddingVertical: 13, paddingHorizontal: 28, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
