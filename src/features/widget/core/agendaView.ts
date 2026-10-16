import i18n from '@/utils/i18n';
import type { AgendaEventItem, AgendaSnapshot } from './types';
import { type WidgetPalette, type WidgetScheme, widgetPalette } from './theme';

export interface AgendaGroup {
  key: string;
  header: string;
  isToday: boolean;
  items: AgendaEventItem[];
}

export interface AgendaHeader {
  dayLabel: string;
  dayNumber: string;
}

export function agendaScheme(snapshot: AgendaSnapshot | null): WidgetScheme {
  return snapshot?.scheme ?? 'light';
}

export function agendaPalette(snapshot: AgendaSnapshot | null): WidgetPalette {
  return widgetPalette(agendaScheme(snapshot));
}

export function agendaHeader(snapshot: AgendaSnapshot | null): AgendaHeader {
  return {
    dayLabel: snapshot?.dayLabel ?? '',
    dayNumber: snapshot?.dayNumber ?? '--',
  };
}

export function emptyLabel(snapshot: AgendaSnapshot | null): string {
  return snapshot?.relativeLabel ?? i18n.t('widget.emptyAgenda', { lng: snapshot?.locale });
}

export function compactEvents(snapshot: AgendaSnapshot | null, limit: number): AgendaEventItem[] {
  return snapshot?.events.slice(0, limit) ?? [];
}

export function agendaGroups(snapshot: AgendaSnapshot | null, budget = Infinity): AgendaGroup[] {
  const groups: AgendaGroup[] = [];
  let left = budget;
  for (const section of snapshot?.sections ?? []) {
    if (left <= 0) break;
    if (section.items.length === 0) continue;
    const items = section.items.slice(0, left);
    left -= items.length;
    groups.push({
      key: section.dayKey,
      header: `${section.weekdayLong} ${section.dayNumber}`,
      isToday: section.isToday,
      items,
    });
  }
  return groups;
}
