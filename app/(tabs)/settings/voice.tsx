import { useTranslation } from 'react-i18next';

import { useAccountStore } from '@/stores/accountStore';
import { useAccounts } from '@/hooks/useAccounts';
import { useSettingsStore } from '@/stores/settingsStore';
import { AvatarImage } from '@/components/AvatarImage';
import { hostnameOf } from '@/features/account/utils/account';
import { AvailabilityCalendarSettings } from '@/features/settings/components/AvailabilityCalendarSettings';
import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { supportsOnDeviceRecognition } from '@/services/voice/stt';
import { Divider, Stack, Toggle, Typography } from '@/ui/components';

const cardOuter = { marginHorizontal: 16, marginBottom: 12 };

export default function VoiceSettingsScreen() {
  const { t } = useTranslation();
  const accounts = useAccounts();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const enabledByAccount = useSettingsStore((s) => s.voiceAssistantByAccount);
  const setEnabled = useSettingsStore((s) => s.setVoiceAssistantEnabled);
  const onDevice = useSettingsStore((s) => s.voiceOnDevicePreferred);
  const setOnDevice = useSettingsStore((s) => s.setVoiceOnDevicePreferred);
  const onDeviceSupported = supportsOnDeviceRecognition();
  const enabled = activeAccountId ? (enabledByAccount[activeAccountId] ?? false) : false;

  return (
    <SettingsPage title={t('settings.voice.title')}>
      <Stack card gap={12} padding={16} hAlign="stretch" style={cardOuter}>
        <Stack gap={2}>
          <Typography variant="body1">{t('voice.enabled')}</Typography>
          <Typography variant="caption" color="secondary">{t('voice.enabledHint')}</Typography>
        </Stack>
        {accounts.map((account, i) => (
          <Stack key={account.id} gap={12} hAlign="stretch">
            {i > 0 && <Divider />}
            <Stack direction="horizontal" vAlign="center" gap={12}>
              <AvatarImage account={account} size={32} />
              <Stack gap={2} style={{ flex: 1 }}>
                <Typography variant="body1" numberOfLines={1}>
                  {account.displayName || account.username}
                </Typography>
                <Typography variant="caption" color="secondary" numberOfLines={1}>
                  {hostnameOf(account.baseUrl)}
                </Typography>
              </Stack>
              <Toggle
                value={enabledByAccount[account.id] ?? false}
                onValueChange={(v) => setEnabled(account.id, v)}
                accessibilityLabel={`${t('voice.enabled')} — ${account.displayName || account.username}`}
                testID={`settings-voice-enabled-${account.id}`}
              />
            </Stack>
          </Stack>
        ))}
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
