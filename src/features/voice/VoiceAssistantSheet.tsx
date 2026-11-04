import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Check, Mic, Send, X } from 'lucide-react-native';
import {
  AnimatedPressable,
  Button,
  Icon,
  IconButton,
  ScreenHeader,
  Spinner,
  Stack,
  TextField,
  Typography,
} from '@/ui/components';

export type VoiceSheetState =
  | 'listening' | 'parsed' | 'confirming' | 'disambiguating'
  | 'executing' | 'thinking' | 'replying' | 'error';

export interface VoiceSheetProps {
  visible: boolean;
  state: VoiceSheetState;
  transcript: string;          // live partial or submitted text
  intentDescription?: string;  // human-readable parsed intent (already localized by caller)
  candidates?: string[];       // disambiguation list labels
  reply?: string;              // agent/TTS reply text
  errorText?: string;
  onSubmitText: (t: string) => void;   // typed fallback input
  onConfirm: () => void;
  onCancel: () => void;
  onPickCandidate: (index: number) => void;
  onClose: () => void;
  onRelisten?: () => void;             // restart STT ("tap to speak again")
}

export function VoiceAssistantSheet({
  visible,
  state,
  transcript,
  intentDescription,
  candidates,
  reply,
  errorText,
  onSubmitText,
  onConfirm,
  onCancel,
  onPickCandidate,
  onClose,
  onRelisten,
}: VoiceSheetProps): React.JSX.Element {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');

  const busy = state === 'executing' || state === 'thinking';
  const confirming = state === 'parsed' || state === 'confirming';
  const listening = state === 'listening';

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    onSubmitText(text);
    setDraft('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <AnimatedPressable animated={false} onPress={onClose} style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
          <View
            onStartShouldSetResponder={() => true}
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
              title={t('voice.open')}
              left={
                <IconButton
                  testID="voice-close"
                  variant="ghost"
                  round
                  size={40}
                  onPress={onClose}
                  accessibilityLabel={t('common.close')}
                >
                  <Icon size={22}>
                    <X />
                  </Icon>
                </IconButton>
              }
            />

            <Stack gap={12}>
              {listening ? (
                <Stack hAlign="center" gap={8} padding={[0, 8]}>
                  <View style={[styles.micCircle, { backgroundColor: colors.primary }]}>
                    <Mic size={32} color="#ffffff" />
                  </View>
                  <Typography variant="body2">{t('voice.listening')}</Typography>
                  <Typography variant="caption" color="secondary" align="center">
                    {t('voice.hint')}
                  </Typography>
                </Stack>
              ) : null}

              {confirming ? (
                <Stack gap={8}>
                  {intentDescription ? (
                    <Stack card padding={12}>
                      <Typography variant="body2">{intentDescription}</Typography>
                    </Stack>
                  ) : null}
                  <Stack direction="horizontal" gap={8}>
                    <View style={styles.grow}>
                      <Button
                        testID="voice-confirm"
                        variant="primary"
                        title={t('voice.confirm')}
                        icon={<Check size={18} color="#ffffff" />}
                        accessibilityLabel={t('voice.confirm')}
                        onPress={onConfirm}
                        disabled={busy}
                      />
                    </View>
                    <View style={styles.grow}>
                      <Button
                        testID="voice-cancel"
                        variant="secondary"
                        title={t('voice.cancel')}
                        icon={<X size={18} color={colors.text} />}
                        accessibilityLabel={t('voice.cancel')}
                        onPress={onCancel}
                        disabled={busy}
                      />
                    </View>
                  </Stack>
                </Stack>
              ) : null}

              {state === 'disambiguating' ? (
                <Stack gap={8}>
                  <Typography variant="body2">{t('voice.chooseOne')}</Typography>
                  {(candidates ?? []).map((label, i) => (
                    <Button
                      key={`${i}`}
                      testID={`voice-candidate-${i}`}
                      variant="secondary"
                      alignment="start"
                      title={label}
                      accessibilityLabel={label}
                      onPress={() => onPickCandidate(i)}
                      disabled={busy}
                    />
                  ))}
                </Stack>
              ) : null}

              {state === 'executing' ? (
                <Stack hAlign="center" padding={[0, 8]}>
                  <Spinner />
                </Stack>
              ) : null}

              {state === 'thinking' ? (
                <Stack direction="horizontal" hAlign="center" vAlign="center" gap={8} padding={[0, 8]}>
                  <Spinner size="small" />
                  <Typography variant="body2" color="secondary">
                    {t('voice.thinking')}
                  </Typography>
                </Stack>
              ) : null}

              {state === 'replying' && reply ? (
                <Stack card padding={12}>
                  <Typography variant="body1">{reply}</Typography>
                </Stack>
              ) : null}

              {state === 'error' ? (
                <Stack hAlign="center" gap={8}>
                  <Icon color={colors.danger} size={22}>
                    <AlertCircle />
                  </Icon>
                  {errorText ? (
                    <Typography variant="body2" color="danger" align="center">
                      {errorText}
                    </Typography>
                  ) : null}
                  <Button
                    testID="voice-retry"
                    variant="secondary"
                    title={t('voice.retry')}
                    accessibilityLabel={t('voice.retry')}
                    onPress={() =>
                      transcript.trim() ? onSubmitText(transcript.trim()) : onRelisten?.()
                    }
                    disabled={busy || (!transcript.trim() && !onRelisten)}
                  />
                </Stack>
              ) : null}

              {transcript ? (
                <Typography
                  variant={listening ? 'body2' : 'caption'}
                  color={listening ? 'text' : 'secondary'}
                  align="center"
                >
                  {transcript}
                </Typography>
              ) : null}

              <Stack direction="horizontal" vAlign="center" gap={8}>
                <View style={styles.grow}>
                  <TextField
                    testID="voice-input"
                    value={draft}
                    onChangeText={setDraft}
                    placeholder={t('voice.inputPlaceholder')}
                    accessibilityLabel={t('voice.inputPlaceholder')}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="send"
                    onSubmitEditing={submit}
                    editable={!busy}
                  />
                </View>
                <IconButton
                  testID="voice-mic"
                  variant="ghost"
                  round
                  size={48}
                  onPress={onRelisten}
                  disabled={busy || !onRelisten}
                  accessibilityLabel={t(listening ? 'voice.listening' : 'voice.tapToSpeak')}
                >
                  <Mic size={20} color={listening ? colors.primary : colors.text} />
                </IconButton>
                <IconButton
                  testID="voice-submit"
                  variant="filled"
                  round
                  size={48}
                  onPress={submit}
                  disabled={busy || !draft.trim()}
                  accessibilityLabel={t('voice.send')}
                >
                  <Icon size={20}>
                    <Send />
                  </Icon>
                </IconButton>
              </Stack>
            </Stack>
          </View>
        </KeyboardAvoidingView>
      </AnimatedPressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  kav: {
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
  micCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1 },
});
