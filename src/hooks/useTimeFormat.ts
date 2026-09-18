import { useMemo } from 'react';
import dayjs from 'dayjs';

import { useSettingsStore } from '@/stores/settingsStore';
import { formatHour as formatHourUtil, formatTime as formatTimeUtil, resolveUse24h } from '@/utils/timeFormat';

export function useTimeFormat() {
  const timeFormat = useSettingsStore((s) => s.timeFormat);
  const language = useSettingsStore((s) => s.language);
  const use24h = resolveUse24h(timeFormat, language);
  return useMemo(() => ({
    use24h,
    timeFormat,
    formatTime: (date: Date | dayjs.Dayjs | string | number) => formatTimeUtil(date, use24h),
    formatHour: (hour: number) => formatHourUtil(hour, use24h),
  }), [use24h, timeFormat]);
}
