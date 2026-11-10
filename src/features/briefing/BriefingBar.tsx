import React from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Pause, Play, SkipForward, X } from 'lucide-react-native';
import { Icon, IconButton, Stack, Typography } from '@/ui/components';

export interface BriefingBarProps {
  status: 'idle' | 'speaking' | 'paused';
  currentText: string;
  onPause: () => void;
  onResume: () => void;
  onNext: () => void;
  onStop: () => void;
  style?: ViewStyle;
}

const ICON_SIZE = 20;
const BUTTON_SIZE = 40;

export function BriefingBar({ status, currentText, onPause, onResume, onNext, onStop, style }: BriefingBarProps): React.JSX.Element | null {
  const { t } = useTranslation();
  if (status === 'idle') return null;
  const speaking = status === 'speaking';

  return (
    <Stack testID="briefing-bar" direction="horizontal" vAlign="center" hAlign="center" gap={6} padding={[12, 4]} card style={[styles.elevated, style]}>
      <Typography variant="caption" nowrap ellipsizeMode="tail" style={styles.text}>
        {currentText}
      </Typography>
      <IconButton
        testID="briefing-toggle"
        accessibilityLabel={t(speaking ? 'briefing.pause' : 'briefing.resume')}
        onPress={speaking ? onPause : onResume}
        variant="filled"
        round
        size={BUTTON_SIZE}
      >
        <Icon size={ICON_SIZE}>{speaking ? <Pause /> : <Play />}</Icon>
      </IconButton>
      <IconButton testID="briefing-next" accessibilityLabel={t('briefing.next')} onPress={onNext} variant="plain" size={BUTTON_SIZE}>
        <Icon size={ICON_SIZE}>
          <SkipForward />
        </Icon>
      </IconButton>
      <IconButton testID="briefing-stop" accessibilityLabel={t('briefing.stop')} onPress={onStop} variant="plain" size={BUTTON_SIZE}>
        <Icon size={ICON_SIZE}>
          <X />
        </Icon>
      </IconButton>
    </Stack>
  );
}

const styles = StyleSheet.create({
  elevated: {
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  text: { flex: 1 },
});
