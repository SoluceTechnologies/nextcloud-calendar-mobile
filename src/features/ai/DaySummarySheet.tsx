import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Copy, RefreshCw } from 'lucide-react-native';
import { Button, Sheet, Spinner, Stack, Typography } from '@/ui/components';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTaskTypes } from './useTaskTypes';
import { useDaySummary } from './useDaySummary';

interface DaySummarySheetProps {
  visible: boolean;
  onClose: () => void;
  dayIso: string;
}

export function DaySummarySheet({ visible, onClose, dayIso }: DaySummarySheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet visible={visible} onClose={onClose} title={t('ai.title')}>
      {visible ? <Body dayIso={dayIso} /> : null}
    </Sheet>
  );
}

function Body({ dayIso }: { dayIso: string }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const aiEnabled = useSettingsStore((s) => s.aiEnabled);
  const { textTaskType } = useTaskTypes();
  const { summary, fromAi, state, regenerate } = useDaySummary(dayIso);
  const aiActive = aiEnabled && !!textTaskType;
  const thinking = aiActive && (state === 'scheduling' || state === 'running');

  const copy = useCallback(() => {
    void Clipboard.setStringAsync(summary);
  }, [summary]);

  return (
    <Stack gap={12} hAlign="stretch">
      {thinking ? (
        <Stack direction="horizontal" vAlign="center" gap={8} testID="day-summary-thinking">
          <Spinner size="small" />
          <Typography variant="caption" color="secondary">
            {t('ai.thinking')}
          </Typography>
        </Stack>
      ) : null}

      <Typography variant="body1" testID="day-summary-text">
        {summary || t('ai.summary.empty')}
      </Typography>

      {aiActive && state === 'failed' ? (
        <Typography variant="caption" color="danger" testID="day-summary-error">
          {t('ai.error')}
        </Typography>
      ) : null}

      {fromAi ? (
        <Typography variant="caption" color="secondary" testID="day-summary-disclosure">
          {t('ai.disclosure')}
        </Typography>
      ) : null}

      <Stack direction="horizontal" gap={8}>
        <Button
          testID="day-summary-copy"
          variant="secondary"
          size="small"
          inline
          icon={<Copy size={16} color={colors.primary} />}
          title={t('ai.copy')}
          onPress={copy}
        />
        {aiActive ? (
          <Button
            testID="day-summary-regenerate"
            variant="ghost"
            size="small"
            inline
            loading={thinking}
            icon={<RefreshCw size={16} color={colors.primary} />}
            title={t('ai.regenerate')}
            onPress={regenerate}
          />
        ) : null}
      </Stack>
    </Stack>
  );
}
