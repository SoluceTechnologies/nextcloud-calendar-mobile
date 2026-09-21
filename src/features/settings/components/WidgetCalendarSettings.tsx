import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useAccountStore } from '@/stores/accountStore';
import { useActiveAccount } from '@/hooks/useAccounts';
import { useCalendars } from '@/hooks/useCalendars';
import {
  type MonthWidgetCardStyle,
  type MonthWidgetDayTap,
  type MonthWidgetFontWeight,
  type MonthWidgetTheme,
  useCalendarStore,
} from '@/stores/calendarStore';
import { refreshWidgets } from '@/features/widget';
import { Divider, Select, Stack, Toggle, Typography, type SelectOption } from '@/ui/components';

const cardOuter = { marginHorizontal: 16, marginBottom: 4 };

export function WidgetCalendarSettings() {
  const { t } = useTranslation();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const activeAccount = useActiveAccount(activeAccountId);
  const { data: calendars = [] } = useCalendars(activeAccount);
  const hiddenCalendarIds = useCalendarStore((s) => s.hiddenCalendarIds);
  const widgetDisabledCalendarIds = useCalendarStore((s) => s.widgetDisabledCalendarIds);
  const toggleWidget = useCalendarStore((s) => s.toggleCalendarWidget);
  const monthWidgetFontWeight = useCalendarStore((s) => s.monthWidgetFontWeight);
  const monthWidgetTheme = useCalendarStore((s) => s.monthWidgetTheme);
  const monthWidgetCardStyle = useCalendarStore((s) => s.monthWidgetCardStyle);
  const monthWidgetDayTap = useCalendarStore((s) => s.monthWidgetDayTap);
  const setMonthWidgetFontWeight = useCalendarStore((s) => s.setMonthWidgetFontWeight);
  const setMonthWidgetTheme = useCalendarStore((s) => s.setMonthWidgetTheme);
  const setMonthWidgetCardStyle = useCalendarStore((s) => s.setMonthWidgetCardStyle);
  const setMonthWidgetDayTap = useCalendarStore((s) => s.setMonthWidgetDayTap);

  const setWidget = useCallback((id: string) => {
    toggleWidget(id);
    void refreshWidgets();
  }, [toggleWidget]);

  function setMonthOption<T>(value: T, set: (next: T) => void) {
    set(value);
    void refreshWidgets();
  }

  const fontWeightOptions: SelectOption<MonthWidgetFontWeight>[] = (['light', 'normal', 'medium', 'bold', 'black'] as const).map((value) => ({
    value, label: t(`settings.widgets.month.fontWeight.${value}`),
  }));
  const themeOptions: SelectOption<MonthWidgetTheme>[] = (['system', 'light', 'dark'] as const).map((value) => ({
    value, label: t(`settings.widgets.month.theme.${value}`),
  }));
  const cardStyleOptions: SelectOption<MonthWidgetCardStyle>[] = (['card', 'borderless', 'transparent'] as const).map((value) => ({
    value, label: t(`settings.widgets.month.cardStyle.${value}`),
  }));
  const dayTapOptions: SelectOption<MonthWidgetDayTap>[] = (['calendar', 'newEvent'] as const).map((value) => ({
    value, label: t(`settings.widgets.month.dayTap.${value}`),
  }));

  return (
    <Stack card gap={12} padding={16} hAlign="stretch" style={cardOuter}>
      <Stack gap={2}>
        <Typography variant="body1">{t('settings.widgets.calendars')}</Typography>
        <Typography variant="caption" color="secondary">
          {t('settings.widgets.calendarsHint')}
        </Typography>
      </Stack>

      {calendars.length === 0 ? (
        <Typography variant="caption" color="secondary">
          {t('calendar.drawerNoCalendars')}
        </Typography>
      ) : (
        calendars.map((cal, i) => {
          const hidden = hiddenCalendarIds.includes(cal.id);
          const on = !hidden && !widgetDisabledCalendarIds.includes(cal.id);

          return (
            <Stack key={cal.id} gap={12} hAlign="stretch">
              {i > 0 && <Divider />}
              <Stack direction="horizontal" vAlign="center" gap={12}>
                <Stack gap={2} style={{ flex: 1 }}>
                  <Typography variant="body1" numberOfLines={1}>{cal.displayName}</Typography>
                  {hidden && (
                    <Typography variant="caption" color="secondary">
                      {t('settings.widgets.calendarHidden')}
                    </Typography>
                  )}
                </Stack>
                <Toggle
                  value={on}
                  disabled={hidden}
                  onValueChange={() => setWidget(cal.id)}
                  accessibilityLabel={cal.displayName}
                />
              </Stack>
            </Stack>
          );
        })
      )}

      <Divider />

      <Stack gap={2}>
        <Typography variant="body1">{t('settings.widgets.month.title')}</Typography>
        <Typography variant="caption" color="secondary">{t('settings.widgets.month.hint')}</Typography>
      </Stack>

      <Typography variant="body1">{t('settings.widgets.month.fontWeightLabel')}</Typography>
      <Select value={monthWidgetFontWeight} options={fontWeightOptions} onChange={(value) => setMonthOption(value, setMonthWidgetFontWeight)} />
      <Typography variant="body1">{t('settings.widgets.month.themeLabel')}</Typography>
      <Select value={monthWidgetTheme} options={themeOptions} onChange={(value) => setMonthOption(value, setMonthWidgetTheme)} />
      <Typography variant="body1">{t('settings.widgets.month.cardStyleLabel')}</Typography>
      <Select value={monthWidgetCardStyle} options={cardStyleOptions} onChange={(value) => setMonthOption(value, setMonthWidgetCardStyle)} />
      <Typography variant="body1">{t('settings.widgets.month.dayTapLabel')}</Typography>
      <Select value={monthWidgetDayTap} options={dayTapOptions} onChange={(value) => setMonthOption(value, setMonthWidgetDayTap)} />
    </Stack>
  );
}
