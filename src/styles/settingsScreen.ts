import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionHeader: {
    fontSize: 13, fontWeight: '700', textTransform: 'uppercase',
    paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8,
  },
  card: {
    marginHorizontal: 16, borderRadius: 12, borderWidth: 1,
    padding: 16, marginBottom: 4,
  },
  cardLabel: { fontSize: 15, fontWeight: '500', marginBottom: 12 },
  themeRow: { flexDirection: 'row', gap: 8 },
  themeChip: {
    flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5,
    alignItems: 'center',
  },
  themeChipText: { fontSize: 14 },
  zoomHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  resetText: { fontSize: 14, fontWeight: '500' },
  zoomRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  zoomBtn: { width: 44, height: 44, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  zoomBtnText: { fontSize: 24, fontWeight: '300', lineHeight: 28 },
  zoomLabel: { flex: 1, textAlign: 'center', fontSize: 14 },
  pageHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4,
  },
  pageTitle: { fontSize: 28, fontWeight: '700' },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    width: '100%', borderRadius: 20, borderWidth: 1,
    padding: 24, alignItems: 'center',
  },
  appIcon: { width: 72, height: 72, borderRadius: 16, marginBottom: 12 },
  modalAppName: { fontSize: 20, fontWeight: '700', marginBottom: 2 },
  modalVersion: { fontSize: 14, marginBottom: 12 },
  modalDescription: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  modalBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    width: '100%', paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: 12, borderWidth: 1.5, marginBottom: 8, justifyContent: 'center',
  },
  modalBtnText: { fontSize: 15, fontWeight: '600' },
  modalClose: { marginTop: 8, paddingVertical: 4 },
  modalCloseText: { fontSize: 14 },
  addBtn: {
    marginHorizontal: 16, marginTop: 8, borderRadius: 12, borderWidth: 1,
    borderStyle: 'dashed', paddingVertical: 14, alignItems: 'center',
  },
  addBtnText: { fontSize: 15, fontWeight: '600' },
});
