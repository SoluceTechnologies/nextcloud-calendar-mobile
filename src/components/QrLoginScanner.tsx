/**
 * Full-screen QR scanner for Nextcloud login codes.
 *
 * Nextcloud Dashboard → "Log in via QR code" produces a URL like:
 *   nc://login/user:john&password:DoTDr-xBooB-Pt9Xz&server:https://cloud.example.com
 *
 * On a valid scan the modal closes and calls onScanned with the parsed fields.
 * The camera is released immediately once a code is found.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTheme } from '@/hooks/useTheme';

export interface NcLoginData {
  server: string;
  user: string;
  password: string;
}

function parseNcLoginUrl(raw: string): NcLoginData | null {
  if (!raw.startsWith('nc://login/')) return null;
  const payload = raw.slice('nc://login/'.length);

  const userMatch   = payload.match(/(?:^|&)user:([^&]+)/);
  const passMatch   = payload.match(/(?:^|&)password:([^&]+)/);

  const serverMatch = payload.match(/(?:^|&)server:(.+)$/);

  if (!userMatch || !passMatch || !serverMatch) return null;

  return {
    user:     decodeURIComponent(userMatch[1]),
    password: decodeURIComponent(passMatch[1]),
    server:   decodeURIComponent(serverMatch[1]).replace(/\/$/, ''),
  };
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onScanned: (data: NcLoginData) => void;
}

export function QrLoginScanner({ visible, onClose, onScanned }: Props) {
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
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

  function handleBarCodeScanned({ data }: { data: string }) {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setScanned(true);

    const parsed = parseNcLoginUrl(data);
    if (!parsed) {
      setParseError('Not a valid Nextcloud login QR code. Try scanning again.');
      scannedRef.current = false;
      setScanned(false);
      return;
    }
    onScanned(parsed);
  }

  if (!visible) return null;

  if (!permission) {
    return (
      <Modal visible animationType="slide" onRequestClose={onClose}>
        <View style={[styles.center, { backgroundColor: theme.background }]}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible animationType="slide" onRequestClose={onClose}>
        <View style={[styles.center, { backgroundColor: theme.background }]}>
          <Text style={[styles.permText, { color: theme.text }]}>
            Camera access is required to scan the QR code.
          </Text>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: theme.primary }]}
            onPress={requestPermission}
          >
            <Text style={styles.btnText}>Allow Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelLink} onPress={onClose}>
            <Text style={{ color: theme.textSecondary }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
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
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan Nextcloud QR</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.footer}>
          {parseError ? (
            <>
              <Text style={styles.errorText}>{parseError}</Text>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: theme.primary, marginTop: 12 }]}
                onPress={() => { scannedRef.current = false; setScanned(false); setParseError(null); }}
              >
                <Text style={styles.btnText}>Try Again</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.hintText}>
              Open your Nextcloud dashboard → tap your avatar → "Log in via QR code"
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
  overlay: { ...StyleSheet.absoluteFillObject },
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: '#fff', fontSize: 18 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },
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
  cancelLink: { marginTop: 16 },
});
