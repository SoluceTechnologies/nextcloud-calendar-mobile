import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useEventsForRange } from '@/database/useEvents';
import { useAccountStore } from '@/stores/accountStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { CalendarEvent } from '@/types';

import { dayEventsToPrompt } from './prompts';
import { templateSummary } from './templateSummary';
import { useTaskTypes } from './useTaskTypes';
import { useTextTask, type TextTaskState } from './useTextTask';

function dayRange(dayIso: string): { start: Date; end: Date } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayIso);
  const now = new Date();
  const y = m ? Number(m[1]) : now.getFullYear();
  const mo = m ? Number(m[2]) - 1 : now.getMonth();
  const d = m ? Number(m[3]) : now.getDate();
  return { start: new Date(y, mo, d), end: new Date(y, mo, d + 1) };
}

function toSummaryEvent(e: CalendarEvent) {
  return {
    summary: e.summary,
    start: e.dtstart.toISOString(),
    end: e.dtend.toISOString(),
    isAllDay: e.allDay,
    location: e.location,
    isTask: e.isTask,
  };
}

export function useDaySummary(dayIso: string): {
  summary: string;
  fromAi: boolean;
  state: TextTaskState;
  regenerate: () => void;
} {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const aiEnabled = useSettingsStore((s) => s.aiEnabled);
  const language = useSettingsStore((s) => s.language);
  const { textTaskType } = useTaskTypes();
  const { state, output, run, reset } = useTextTask();

  const { start, end } = useMemo(() => dayRange(dayIso), [dayIso]);
  const events = useEventsForRange(activeAccountId ?? '', start, end);
  // useEventsForRange keeps the previous range's rows until the new subscription
  // emits — drop anything that does not belong to this account/day before it can
  // reach the AI prompt or the template.
  const summaryEvents = useMemo(
    () =>
      events
        .filter((e) => e.accountId === activeAccountId && e.dtstart < end && e.dtend >= start)
        .map(toSummaryEvent),
    [events, activeAccountId, start, end]
  );

  const template = useMemo(
    () => templateSummary(summaryEvents, { locale: language }),
    [summaryEvents, language]
  );

  const runKey = `${activeAccountId ?? 'none'}:${dayIso}`;
  const prevKeyRef = useRef(runKey);
  const firedRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevKeyRef.current === runKey) return;
    prevKeyRef.current = runKey;
    reset();
  }, [runKey, reset]);

  useEffect(() => {
    if (!aiEnabled || !textTaskType) reset();
  }, [aiEnabled, textTaskType, reset]);

  useEffect(() => {
    if (!aiEnabled || !textTaskType || summaryEvents.length === 0) return;
    if (firedRef.current === runKey) return;
    firedRef.current = runKey;
    void run(dayEventsToPrompt(summaryEvents, { locale: language }), {
      customId: `day-summary:${runKey}`,
    });
  }, [aiEnabled, textTaskType, summaryEvents, runKey, language, run]);

  const regenerate = useCallback(() => {
    firedRef.current = runKey;
    void run(dayEventsToPrompt(summaryEvents, { locale: language }), {
      customId: `day-summary:${runKey}`,
    });
  }, [run, summaryEvents, language, runKey]);

  const fromAi = aiEnabled && state === 'done' && output != null;
  return { summary: fromAi ? output : template, fromAi, state, regenerate };
}
