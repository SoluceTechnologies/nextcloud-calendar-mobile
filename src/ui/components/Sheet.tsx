import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react-native';
import AnimatedPressable from './AnimatedPressable';
import IconButton from './IconButton';
import ScreenHeader from './ScreenHeader';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

function Sheet({ visible, onClose, title, children }: SheetProps) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <AnimatedPressable animated={false} onPress={onClose} style={StyleSheet.absoluteFill} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <ScreenHeader
            title={title}
            left={
              <IconButton variant="ghost" round size={40} onPress={onClose} accessibilityLabel={t('common.close')}>
                <X size={22} color={colors.text} />
              </IconButton>
            }
          />
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
});

export default React.memo(Sheet);
