import { useCallback, useState } from 'react';
import { Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useSettingsStore } from '@/stores/settingsStore';
import { refreshWidgets } from '@/features/widget';
import { liveActivity } from '@/features/widget/surfaces/liveActivity';
import { AlarmOffsetPicker } from '@/features/notifications/AlarmOffsetPicker';
import { requestAlertPermission, scheduleEventAlerts } from '@/features/notifications/scheduleAlerts';
import { Button, Divider, Stack, Toggle, Typography } from '@/ui/components';

const cardOuter = { marginHorizontal: 16, marginBottom: 4 };

export function NotificationSettings() {
  const { t } = useTranslation();
  const enabled = useSettingsStore((s) => s.liveActivityEnabled);
  const setEnabled = useSettingsStore((s) => s.setLiveActivityEnabled);
  const timedAlerts = useSettingsStore((s) => s.timedAlerts);
  const allDayAlerts = useSettingsStore((s) => s.allDayAlerts);
  const setTimedAlerts = useSettingsStore((s) => s.setTimedAlerts);
  const setAllDayAlerts = useSettingsStore((s) => s.setAllDayAlerts);

  const [granted, setGranted] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setGranted(liveActivity.isSupported());
    }, [])
  );

  async function handleEnable(next: boolean) {
    setEnabled(next);

    if (!next) {
      await liveActivity.clear();
      return;
    }

    const ok = (await liveActivity.requestPermission?.()) ?? true;
    setGranted(ok);
    await refreshWidgets();
  }

  async function applyAlerts(next: number[], set: (v: number[]) => void) {
    set(next);
    if (next.length > 0) await requestAlertPermission();
    await scheduleEventAlerts();
  }

  return (
    <Stack card gap={12} padding={16} hAlign="stretch" style={cardOuter}>
      <Stack direction="horizontal" vAlign="center" gap={12}>
        <Stack gap={2} style={{ flex: 1 }}>
          <Typography variant="body1">{t('settings.notifications.liveActivity')}</Typography>
          <Typography variant="caption" color="secondary">
            {t('settings.notifications.liveActivityHint')}
          </Typography>
        </Stack>
        <Toggle value={enabled} onValueChange={handleEnable} />
      </Stack>

      {enabled && !granted && (
        <>
          <Typography variant="caption" color="secondary">
            {t('settings.notifications.permissionDenied')}
          </Typography>
          <Button
            variant="link" size="small" alignment="start" color="primary"
            title={t('settings.notifications.openSettings')}
            onPress={() => Linking.openSettings()}
          />
        </>
      )}

      <Divider />

      <Stack gap={2}>
        <Typography variant="body1">{t('settings.alerts.timed')}</Typography>
        <Typography variant="caption" color="secondary">{t('settings.alerts.timedHint')}</Typography>
      </Stack>
      <AlarmOffsetPicker
        values={timedAlerts}
        onChange={(v) => void applyAlerts(v, setTimedAlerts)}
      />

      <Stack gap={2}>
        <Typography variant="body1">{t('settings.alerts.allDay')}</Typography>
        <Typography variant="caption" color="secondary">{t('settings.alerts.allDayHint')}</Typography>
      </Stack>
      <AlarmOffsetPicker
        values={allDayAlerts}
        onChange={(v) => void applyAlerts(v, setAllDayAlerts)}
        allDay
      />
    </Stack>
  );
}
