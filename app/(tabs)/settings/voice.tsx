import { useTranslation } from 'react-i18next';

import { useSettingsStore } from '@/stores/settingsStore';
import { AvailabilityCalendarSettings } from '@/features/settings/components/AvailabilityCalendarSettings';
import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { supportsOnDeviceRecognition } from '@/services/voice/stt';
import { Stack, Toggle, Typography } from '@/ui/components';

const cardOuter = { marginHorizontal: 16, marginBottom: 12 };

export default function VoiceSettingsScreen() {
  const { t } = useTranslation();
  const enabled = useSettingsStore((s) => s.voiceAssistantEnabled);
  const setEnabled = useSettingsStore((s) => s.setVoiceAssistantEnabled);
  const onDevice = useSettingsStore((s) => s.voiceOnDevicePreferred);
  const setOnDevice = useSettingsStore((s) => s.setVoiceOnDevicePreferred);
  const onDeviceSupported = supportsOnDeviceRecognition();

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
      {enabled && (
        <Stack card gap={12} padding={16} hAlign="stretch" style={cardOuter}>
          <Stack direction="horizontal" vAlign="center" gap={12}>
            <Stack gap={2} style={{ flex: 1 }}>
              <Typography variant="body1">{t('voice.onDevice')}</Typography>
              <Typography variant="caption" color="secondary">
                {onDeviceSupported ? t('voice.onDeviceHint') : t('voice.onDeviceUnsupported')}
              </Typography>
            </Stack>
            <Toggle
              value={onDevice && onDeviceSupported}
              onValueChange={setOnDevice}
              disabled={!onDeviceSupported}
              accessibilityLabel={t('voice.onDevice')}
              testID="settings-voice-ondevice"
            />
          </Stack>
        </Stack>
      )}
      {enabled && <AvailabilityCalendarSettings />}
      <Stack card gap={8} padding={16} hAlign="stretch" style={cardOuter}>
        <Typography variant="caption" color="secondary">{t('settings.voice.tierNote')}</Typography>
      </Stack>
    </SettingsPage>
  );
}
