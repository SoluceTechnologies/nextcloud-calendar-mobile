import { useTranslation } from 'react-i18next';

import { useSettingsStore } from '@/stores/settingsStore';
import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { Select, Stack, Toggle, Typography, type SelectOption } from '@/ui/components';
import type { TalkOpenMode } from '@/types';

const cardOuter = { marginHorizontal: 16, marginBottom: 12 };

const TALK_OPEN_MODE_VALUES: TalkOpenMode[] = ['app', 'browser', 'ask'];
const TALK_OPEN_MODE_LABEL_KEY: Record<TalkOpenMode, string> = {
  app: 'settings.talk.openInApp',
  browser: 'settings.talk.openInBrowser',
  ask: 'settings.talk.askEachTime',
};

export default function TalkSettingsScreen() {
  const { t } = useTranslation();
  const talkOpenMode = useSettingsStore((s) => s.talkOpenMode);
  const setTalkOpenMode = useSettingsStore((s) => s.setTalkOpenMode);
  const callReminder = useSettingsStore((s) => s.talkCallReminder);
  const setCallReminder = useSettingsStore((s) => s.setTalkCallReminder);

  const options: SelectOption<TalkOpenMode>[] = TALK_OPEN_MODE_VALUES.map((value) => ({
    value,
    label: t(TALK_OPEN_MODE_LABEL_KEY[value]),
  }));

  return (
    <SettingsPage title={t('settings.talk.title')}>
      <Stack card gap={12} padding={16} hAlign="stretch" style={cardOuter}>
        <Stack gap={2}>
          <Typography variant="body1">{t('settings.talk.openWith')}</Typography>
          <Typography variant="caption" color="secondary">{t('settings.talk.openWithHint')}</Typography>
        </Stack>
        <Select<TalkOpenMode>
          value={talkOpenMode}
          options={options}
          accessibilityLabel={t('settings.talk.openWith')}
          onChange={(v) => setTalkOpenMode(v)}
        />
      </Stack>
      <Stack card gap={12} padding={16} hAlign="stretch" style={cardOuter}>
        <Stack direction="horizontal" vAlign="center" gap={12}>
          <Stack gap={2} style={{ flex: 1 }}>
            <Typography variant="body1">{t('settings.talk.callReminder')}</Typography>
            <Typography variant="caption" color="secondary">{t('settings.talk.callReminderHint')}</Typography>
          </Stack>
          <Toggle
            value={callReminder}
            onValueChange={setCallReminder}
            accessibilityLabel={t('settings.talk.callReminder')}
            testID="settings-talk-call-reminder"
          />
        </Stack>
      </Stack>
    </SettingsPage>
  );
}
