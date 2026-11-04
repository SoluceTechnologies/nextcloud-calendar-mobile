import { useTranslation } from 'react-i18next';

import { useSettingsStore } from '@/stores/settingsStore';
import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { Stack, Toggle, Typography } from '@/ui/components';

const cardOuter = { marginHorizontal: 16, marginBottom: 12 };

export default function VoiceSettingsScreen() {
  const { t } = useTranslation();
  const enabled = useSettingsStore((s) => s.voiceAssistantEnabled);
  const setEnabled = useSettingsStore((s) => s.setVoiceAssistantEnabled);

  return (
    <SettingsPage title={t('settings.voice.title')}>
      <Stack card gap={12} padding={16} hAlign="stretch" style={cardOuter}>
        <Stack direction="horizontal" vAlign="center" gap={12}>
          <Stack gap={2} style={{ flex: 1 }}>
            <Typography variant="body1">{t('voice.enabled')}</Typography>
            <Typography variant="caption" color="secondary">{t('voice.enabledHint')}</Typography>
          </Stack>
          <Toggle
            value={enabled}
            onValueChange={setEnabled}
            accessibilityLabel={t('voice.enabled')}
            testID="settings-voice-enabled"
          />
        </Stack>
      </Stack>
      <Stack card gap={8} padding={16} hAlign="stretch" style={cardOuter}>
        <Typography variant="caption" color="secondary">{t('settings.voice.tierNote')}</Typography>
      </Stack>
    </SettingsPage>
  );
}
