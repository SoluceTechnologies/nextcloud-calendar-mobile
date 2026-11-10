import dayjs from 'dayjs';

import type { CalendarEvent } from '@/types';
import { formatTime, resolveUse24h } from '@/utils/timeFormat';

// Contract §4 names start/end/isAllDay; raw CalendarEvent (dtstart/dtend/allDay) is also accepted.
export type SummaryEventInput = Pick<CalendarEvent, 'summary' | 'location' | 'isTask'> & {
  start?: string | Date;
  end?: string | Date;
  isAllDay?: boolean;
  dtstart?: Date;
  dtend?: Date;
  allDay?: boolean;
};

export const eventStart = (e: SummaryEventInput) => e.start ?? e.dtstart;
export const eventEnd = (e: SummaryEventInput) => e.end ?? e.dtend;
export const eventIsAllDay = (e: SummaryEventInput) => e.isAllDay ?? e.allDay ?? false;

function fmt(value: string | Date | undefined, use24h: boolean): string | null {
  if (value == null) return null;
  const d = dayjs(value);
  return d.isValid() ? formatTime(d, use24h) : null;
}

// Privacy: only summary, times, isAllDay, isTask, location — never description or attendees.
function eventLine(e: SummaryEventInput, use24h: boolean): string {
  const parts: string[] = [];
  if (eventIsAllDay(e)) {
    parts.push('all-day');
  } else {
    const s = fmt(eventStart(e), use24h);
    const en = fmt(eventEnd(e), use24h);
    if (s) parts.push(en ? `${s}–${en}` : s);
  }
  parts.push(e.summary);
  if (e.location) parts.push(e.location);
  return `${e.isTask ? '- [task] ' : '- '}${parts.join(' · ')}`;
}

export function dayEventsToPrompt(
  events: SummaryEventInput[],
  opts: { locale?: string; maxEvents?: number } = {},
): string {
  const { locale, maxEvents = 30 } = opts;
  const use24h = resolveUse24h('auto', locale);
  const shown = events.slice(0, Math.max(0, maxEvents));
  const hidden = events.length - shown.length;

  const lines = [
    `Summarize these calendar events in 1–2 short sentences.${
      locale ? ` Reply in the language of locale "${locale}".` : ''
    } Only use the details below; do not invent facts.`,
    ...shown.map((e) => eventLine(e, use24h)),
  ];
  if (shown.length === 0) lines.push('- No events.');
  else if (hidden > 0) lines.push(`- … and ${hidden} more`);
  return lines.join('\n');
}

export function draftDescriptionPrompt(input: {
  summary: string;
  start?: string;
  end?: string;
  location?: string;
  locale?: string;
}): string {
  const lines = [
    `Write a short description (1–2 sentences) for this calendar event.${
      input.locale ? ` Reply in the language of locale "${input.locale}".` : ' Use the same language as its title.'
    }`,
    'Neutral tone. Do not invent facts; only use the details below.',
    `Title: ${input.summary}`,
  ];
  const fmtDay = (v?: string) => {
    if (!v) return undefined;
    const d = dayjs(v);
    return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : v;
  };
  const s = fmtDay(input.start);
  const en = fmtDay(input.end);
  if (s) lines.push(`Start: ${s}`);
  if (en) lines.push(`End: ${en}`);
  if (input.location) lines.push(`Location: ${input.location}`);
  return lines.join('\n');
}
