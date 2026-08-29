import { useCallback, useState } from 'react';
import { Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useSettingsStore } from '@/stores/settingsStore';
import { useAccountStore } from '@/stores/accountStore';
import { useActiveAccount } from '@/hooks/useAccounts';
import { registerPushNotifications, unregisterPushNotifications } from '@/services/push/pushRegistration';
import { refreshWidgets } from '@/features/widget';
import { liveActivity } from '@/features/widget/surfaces/liveActivity';
import {
  ALL_DAY_ALERTS, TIMED_ALERTS, allDayAlertLabelKey, timedAlertLabelKey,
  type AllDayAlert, type TimedAlert,
} from '@/features/notifications/alerts';
import { requestAlertPermission, scheduleEventAlerts } from '@/features/notifications/scheduleAlerts';
import { Button, Divider, Select, Stack, Toggle, Typography, type SelectOption } from '@/ui/components';

const cardOuter = { marginHorizontal: 16, marginBottom: 4 };

export function NotificationSettings() {
  const { t } = useTranslation();
  const enabled = useSettingsStore((s) => s.liveActivityEnabled);
  const setEnabled = useSettingsStore((s) => s.setLiveActivityEnabled);
  const pushEnabled = useSettingsStore((s) => s.pushNotifications);
  const setPushEnabled = useSettingsStore((s) => s.setPushNotifications);
  const timedAlert = useSettingsStore((s) => s.timedAlert);
  const allDayAlert = useSettingsStore((s) => s.allDayAlert);
  const setTimedAlert = useSettingsStore((s) => s.setTimedAlert);
  const setAllDayAlert = useSettingsStore((s) => s.setAllDayAlert);

  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const account = useActiveAccount(activeAccountId);

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

  async function applyAlert(value: TimedAlert | AllDayAlert, set: () => void) {
    set();
    if (value !== null) await requestAlertPermission();
    await scheduleEventAlerts();
  }

  async function handlePushEnable(next: boolean) {
    setPushEnabled(next);

    if (!next || !account) {
      if (account) {
        try {
          await unregisterPushNotifications(account);
        } catch (err) {
          console.warn('[NotificationSettings] unregister failed:', err);
        }
      }
      return;
    }

    const ok = await requestAlertPermission();
    if (!ok) return;

    try {
      await registerPushNotifications(account);
    } catch (err) {
      console.warn('[NotificationSettings] register failed:', err);
    }
  }

  const timedOptions: SelectOption<TimedAlert>[] = TIMED_ALERTS.map((value) => ({
    value,
    label: t(timedAlertLabelKey(value)),
  }));

  const allDayOptions: SelectOption<AllDayAlert>[] = ALL_DAY_ALERTS.map((value) => ({
    value,
    label: t(allDayAlertLabelKey(value)),
  }));

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

      <Stack direction="horizontal" vAlign="center" gap={12}>
        <Stack gap={2} style={{ flex: 1 }}>
          <Typography variant="body1">{t('settings.notifications.push')}</Typography>
          <Typography variant="caption" color="secondary">
            {t('settings.notifications.pushHint')}
          </Typography>
        </Stack>
        <Toggle value={pushEnabled} onValueChange={handlePushEnable} />
      </Stack>

      <Divider />

      <Stack gap={2}>
        <Typography variant="body1">{t('settings.alerts.timed')}</Typography>
        <Typography variant="caption" color="secondary">{t('settings.alerts.timedHint')}</Typography>
      </Stack>
      <Select<TimedAlert>
        value={timedAlert}
        options={timedOptions}
        accessibilityLabel={t('settings.alerts.timed')}
        onChange={(v) => void applyAlert(v, () => setTimedAlert(v))}
      />

      <Stack gap={2}>
        <Typography variant="body1">{t('settings.alerts.allDay')}</Typography>
        <Typography variant="caption" color="secondary">{t('settings.alerts.allDayHint')}</Typography>
      </Stack>
      <Select<AllDayAlert>
        value={allDayAlert}
        options={allDayOptions}
        accessibilityLabel={t('settings.alerts.allDay')}
        onChange={(v) => void applyAlert(v, () => setAllDayAlert(v))}
      />
    </Stack>
  );
}
