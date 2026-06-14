import type { ViewMode } from '@/types';

export type CalMode = 'week' | '3days' | 'day';

export const CAL_MODES: CalMode[] = ['week', '3days', 'day'];

export const VIEW_MODES: ViewMode[] = ['month', 'week', '3days', 'day', 'schedule'];

export const VIEW_LABELS: Record<ViewMode, string> = {
  month: 'Month', week: 'Week', '3days': '3D', day: 'Day', schedule: 'Agenda',
};

export const DRAWER_WIDTH = 280;

export const isCalMode = (v: ViewMode): v is CalMode =>
  v === 'week' || v === '3days' || v === 'day';
