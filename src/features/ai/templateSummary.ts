import dayjs from 'dayjs';

import i18n from '@/utils/i18n';
import { formatTime, resolveUse24h } from '@/utils/timeFormat';

import { eventIsAllDay, eventStart, type SummaryEventInput } from './prompts';

export function templateSummary(events: SummaryEventInput[], opts: { locale?: string } = {}): string {
  if (events.length === 0) return '';
  const lng = opts.locale;
  const cal = events.filter((e) => !e.isTask);
  const tasks = events.length - cal.length;

  const parts: string[] = [];
  if (cal.length > 0) parts.push(i18n.t('ai.summary.events', { count: cal.length, lng }));
  if (tasks > 0) parts.push(i18n.t('ai.summary.tasks', { count: tasks, lng }));

  const next = cal
    .map((e) => ({ e, start: eventStart(e) }))
    .filter(
      (x): x is { e: SummaryEventInput; start: string | Date } =>
        !eventIsAllDay(x.e) && x.start != null && dayjs(x.start).isValid(),
    )
    .sort((a, b) => dayjs(a.start).valueOf() - dayjs(b.start).valueOf())[0];

  if (next) {
    const use24h = resolveUse24h('auto', lng);
    const at = i18n.t('ai.summary.at', { lng });
    const loc = next.e.location ? `, ${next.e.location}` : '';
    parts.push(
      `${i18n.t('ai.summary.next', { lng })} ${next.e.summary} ${at} ${formatTime(next.start, use24h)}${loc}`,
    );
  }
  return parts.join(' · ');
}
