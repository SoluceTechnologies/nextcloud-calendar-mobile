import { useTranslation } from 'react-i18next';

import { useSettingsStore } from '@/stores/settingsStore';
import { useTaskTypes } from '@/features/ai/useTaskTypes';
import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { Divider, Stack, Toggle, Typography } from '@/ui/components';

const cardOuter = { marginHorizontal: 16, marginBottom: 12 };

export default function AiSettingsScreen() {
  const { t } = useTranslation();
  const aiEnabled = useSettingsStore((s) => s.aiEnabled);
  const setAiEnabled = useSettingsStore((s) => s.setAiEnabled);
  const { taskTypes, textTaskType, loading } = useTaskTypes();

  const providerName = textTaskType
    ? (taskTypes?.[textTaskType]?.name ?? textTaskType)
    : null;
  const providerStatus = loading
    ? t('ai.thinking')
    : providerName
      ? t('ai.providerAvailable', { name: providerName })
      : t('ai.providerUnavailable');

  return (
    <SettingsPage title={t('ai.title')}>
      <Stack card gap={12} padding={16} hAlign="stretch" style={cardOuter}>
        <Stack direction="horizontal" vAlign="center" gap={12}>
          <Stack gap={2} style={{ flex: 1 }}>
            <Typography variant="body1">{t('ai.enable')}</Typography>
          </Stack>
          <Toggle testID="ai-enable-toggle" value={aiEnabled} onValueChange={setAiEnabled} />
        </Stack>
        {aiEnabled ? (
          <>
            <Divider />
            <Stack gap={2}>
              <Typography variant="body1">{t('ai.provider')}</Typography>
              <Typography variant="caption" color="secondary" testID="ai-provider-status">
                {providerStatus}
              </Typography>
            </Stack>
          </>
        ) : null}
        <Divider />
        <Typography variant="caption" color="secondary">
          {t('ai.privacyNotice')}
        </Typography>
      </Stack>
    </SettingsPage>
  );
}
