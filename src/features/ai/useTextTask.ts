import { useCallback, useEffect, useRef, useState } from 'react';

import { useActiveAccount } from '@/hooks/useAccounts';
import { describeMutationError } from '@/services/shared/errors';
import {
  cancelTask,
  pollTask,
  scheduleTask,
  TaskPollTimeout,
} from '@/services/nextcloud/taskprocessing';
import { useAccountStore } from '@/stores/accountStore';
import type { Account, TaskProcessingTask } from '@/types';

import { useTaskTypes } from './useTaskTypes';

export type TextTaskState = 'idle' | 'scheduling' | 'running' | 'done' | 'failed';

function stripMdEmphasis(text: string): string {
  return text.replace(/(\*\*|__)([^*_]+)\1/g, '$2');
}

function firstTextOutput(task: TaskProcessingTask | null): string | null {
  if (!task?.output) return null;
  const preferred = task.output['output'];
  if (typeof preferred === 'string' && preferred.length > 0) return stripMdEmphasis(preferred);
  for (const v of Object.values(task.output)) {
    if (typeof v === 'string' && v.length > 0) return stripMdEmphasis(v);
  }
  return null;
}

export function useTextTask(): {
  state: TextTaskState;
  output: string | null;
  error: string | null;
  run: (prompt: string, opts?: { customId?: string }) => Promise<void>;
  reset: () => void;
} {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const account = useActiveAccount(activeAccountId);
  const { taskTypes, textTaskType } = useTaskTypes();

  const [state, setState] = useState<TextTaskState>('idle');
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  // Task IDs are scoped to the scheduling account — keep it alongside the ID so
  // a later account switch cannot cancel a foreign task (or the wrong task).
  const taskRef = useRef<{ account: Account; id: number } | null>(null);
  const prevAccountIdRef = useRef(account?.id ?? null);

  const cancelScheduled = useCallback(() => {
    const t = taskRef.current;
    taskRef.current = null;
    if (t) void cancelTask(t.account, t.id);
  }, []);

  useEffect(
    () => () => {
      runIdRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      cancelScheduled();
    },
    [cancelScheduled]
  );

  const reset = useCallback(() => {
    runIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    cancelScheduled();
    setState('idle');
    setOutput(null);
    setError(null);
  }, [cancelScheduled]);

  useEffect(() => {
    const id = account?.id ?? null;
    if (prevAccountIdRef.current === id) return;
    prevAccountIdRef.current = id;
    reset();
  }, [account?.id, reset]);

  const run = useCallback(
    async (prompt: string, opts?: { customId?: string }) => {
      const runId = ++runIdRef.current;
      abortRef.current?.abort();
      cancelScheduled();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      if (!account || !textTaskType) {
        setOutput(null);
        setError(
          describeMutationError(new Error('useTextTask: no active account or text task type'))
        );
        setState('failed');
        return;
      }

      setOutput(null);
      setError(null);
      setState('scheduling');
      // First Text-typed input slot; 'input' covers core:text2text*.
      const shape = taskTypes?.[textTaskType]?.inputShape;
      const inputSlot =
        (shape && Object.entries(shape).find(([, s]) => s?.type === 1)?.[0]) || 'input';
      try {
        const scheduled = await scheduleTask(
          account,
          textTaskType,
          { [inputSlot]: prompt },
          opts?.customId
        );
        if (runId !== runIdRef.current || ctrl.signal.aborted) {
          // Run was dismissed while scheduling — don't orphan the server task.
          void cancelTask(account, scheduled.id);
          return;
        }
        taskRef.current = { account, id: scheduled.id };
        setState('running');
        let done: TaskProcessingTask;
        try {
          done = await pollTask(account, scheduled.id, { signal: ctrl.signal });
        } catch (e) {
          if (!(e instanceof TaskPollTimeout)) throw e;
          // Still running at the deadline is not a failure — keep waiting once
          // more before surfacing a timeout to the user.
          if (runId !== runIdRef.current || ctrl.signal.aborted) return;
          done = await pollTask(account, scheduled.id, { signal: ctrl.signal });
        }
        if (runId !== runIdRef.current || ctrl.signal.aborted) return;
        taskRef.current = null;
        if (done && done.status === 3) {
          const text = firstTextOutput(done);
          if (text) {
            setOutput(text);
            setState('done');
          } else {
            setError(describeMutationError(new Error('useTextTask: task produced no text output')));
            setState('failed');
          }
        } else {
          setError(
            describeMutationError(
              new Error(done?.message ?? `useTextTask: task status ${done?.status ?? 'unknown'}`)
            )
          );
          setState('failed');
        }
      } catch (e) {
        if (runId !== runIdRef.current || ctrl.signal.aborted) return;
        // A task still running after the extended deadline keeps consuming the
        // provider — cancel it best-effort before surfacing the timeout.
        if (e instanceof TaskPollTimeout) cancelScheduled();
        setError(describeMutationError(e));
        setState('failed');
      }
    },
    [account, taskTypes, textTaskType, cancelScheduled]
  );

  return { state, output, error, run, reset };
}
