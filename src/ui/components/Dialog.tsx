import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import AnimatedPressable from './AnimatedPressable';
import Stack from './Stack';

interface DialogProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

function Dialog({ visible, onClose, children }: DialogProps) {
  const { height } = useWindowDimensions();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <AnimatedPressable
          animated={false}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
          testID="dialog-backdrop"
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.center}
          pointerEvents="box-none"
        >
          <Stack card style={[styles.card, { maxHeight: height * 0.85 }]}>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          </Stack>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: { width: '86%', overflow: 'hidden' },
  scroll: { flexShrink: 1 },
  content: { padding: 24, gap: 12, alignItems: 'center' },
});

export default React.memo(Dialog);
