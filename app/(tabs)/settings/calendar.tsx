import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useCalendarStore } from '@/stores/calendarStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { Button, Chip, IconButton, Stack, Typography } from '@/ui/components';

const cardOuter = { marginHorizontal: 16, marginBottom: 12 };

const DEFAULT_ZOOM = 60;
const MIN_ZOOM = 30;
const MAX_ZOOM = 200;
const ZOOM_STEP = 15;

const WEEK_START_OPTIONS = [
  { labelKey: 'settings.sunday', value: 0 },
  { labelKey: 'settings.monday', value: 1 },
] as const;

const TIME_FORMAT_OPTIONS = [
  { labelKey: 'settings.timeFormat.auto', value: 'auto' },
  { labelKey: 'settings.timeFormat.h24', value: '24h' },
  { labelKey: 'settings.timeFormat.h12', value: '12h' },
] as const;

export default function CalendarSettingsScreen() {
  const { t } = useTranslation();
  const hourRowHeight = useCalendarStore((s) => s.hourRowHeight);
  const setHourRowHeight = useCalendarStore((s) => s.setHourRowHeight);
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const setWeekStartsOn = useSettingsStore((s) => s.setWeekStartsOn);
  const timeFormat = useSettingsStore((s) => s.timeFormat);
  const setTimeFormat = useSettingsStore((s) => s.setTimeFormat);

  const [pendingWeek, setPendingWeek] = useState(weekStartsOn);
  useEffect(() => { setPendingWeek(weekStartsOn); }, [weekStartsOn]);

  const zoomLabel =
    hourRowHeight <= 45 ? t('settings.zoom.compact')
    : hourRowHeight <= 75 ? t('settings.zoom.normal')
    : hourRowHeight <= 120 ? t('settings.zoom.expanded')
    : t('settings.zoom.large');

  return (
    <SettingsPage title={t('settings.calendar')}>
      <Stack card gap={12} padding={16} hAlign="stretch" style={cardOuter}>
        <Typography variant="body1">{t('settings.weekStart')}</Typography>
        <Stack direction="horizontal" gap={8}>
          {WEEK_START_OPTIONS.map((opt) => (
            <Chip
              key={String(opt.value)}
              fullWidth
              active={pendingWeek === opt.value}
              onPress={() => { setPendingWeek(opt.value); setWeekStartsOn(opt.value); }}
            >
              {t(opt.labelKey)}
            </Chip>
          ))}
        </Stack>
      </Stack>

      <Stack card gap={12} padding={16} hAlign="stretch" style={cardOuter}>
        <Typography variant="body1">{t('settings.timeFormat.title')}</Typography>
        <Stack direction="horizontal" gap={8}>
          {TIME_FORMAT_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              fullWidth
              active={timeFormat === opt.value}
              onPress={() => setTimeFormat(opt.value)}
            >
              {t(opt.labelKey)}
            </Chip>
          ))}
        </Stack>
      </Stack>

      <Stack card gap={12} padding={16} hAlign="stretch" style={cardOuter}>
        <Typography variant="body1">{t('settings.calendarZoom')}</Typography>
        <Stack direction="horizontal" vAlign="center" gap={12}>
          <IconButton
            disabled={hourRowHeight <= MIN_ZOOM}
            onPress={() => setHourRowHeight(Math.max(hourRowHeight - ZOOM_STEP, MIN_ZOOM))}
          >
            <Typography variant="h4" color="text">−</Typography>
          </IconButton>
          <Typography variant="body2" color="secondary" style={{ flex: 1, textAlign: 'center' }}>
            {zoomLabel}
          </Typography>
          <IconButton
            disabled={hourRowHeight >= MAX_ZOOM}
            onPress={() => setHourRowHeight(Math.min(hourRowHeight + ZOOM_STEP, MAX_ZOOM))}
          >
            <Typography variant="h4" color="text">+</Typography>
          </IconButton>
        </Stack>
        <Button
          variant="link" size="small" alignment="start" color="primary"
          title={t('settings.reset')}
          disabled={hourRowHeight === DEFAULT_ZOOM}
          onPress={() => setHourRowHeight(DEFAULT_ZOOM)}
        />
      </Stack>
    </SettingsPage>
  );
}
