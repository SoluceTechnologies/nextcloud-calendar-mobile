import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  root: { flex: 1 },
  calendarWrapper: { flex: 1, overflow: 'hidden' },
  viewContainer: { flex: 1 },
  viewLayer: { ...StyleSheet.absoluteFillObject },
  layerActive: { opacity: 1, zIndex: 1 },
  layerHidden: { opacity: 0, zIndex: 0 },
  headerWrap: { borderBottomWidth: StyleSheet.hairlineWidth },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 4, height: 44 },
  hamburger: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -4 },
  hamburgerIcon: { fontSize: 22 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700' },
  todayBtn: { width: 44, alignItems: 'flex-end', justifyContent: 'center' },
  todayBtnText: { fontSize: 13, fontWeight: '600' },
  modePills: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  modeBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  modeBtnText: { fontSize: 13 },
  fab: {
    position: 'absolute', right: 20,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 8, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4,
  },
  fabIcon: { fontSize: 28, color: '#fff', lineHeight: 32 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject, zIndex: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  loadingText: { marginTop: 12, fontSize: 14 },
  smallLoader: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    zIndex: 5,
  },
});
