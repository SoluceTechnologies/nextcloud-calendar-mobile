import { useCallback, useEffect, useRef, useState } from 'react';

import { useActiveAccount } from '@/hooks/useAccounts';
import { describeMutationError } from '@/services/shared/errors';
import { cancelTask, pollTask, scheduleTask } from '@/services/nextcloud/taskprocessing';
import { useAccountStore } from '@/stores/accountStore';
import type { TaskProcessingTask } from '@/types';

import { useTaskTypes } from './useTaskTypes';

export type TextTaskState = 'idle' | 'scheduling' | 'running' | 'done' | 'failed';

function firstTextOutput(task: TaskProcessingTask | null): string | null {
  if (!task?.output) return null;
  for (const v of Object.values(task.output)) {
    if (typeof v === 'string' && v.length > 0) return v;
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
  const taskIdRef = useRef<number | null>(null);
  const accountRef = useRef(account);
  accountRef.current = account;

  const cancelScheduled = useCallback(() => {
    const id = taskIdRef.current;
    taskIdRef.current = null;
    if (id != null && accountRef.current) void cancelTask(accountRef.current, id);
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
        taskIdRef.current = scheduled.id;
        if (runId !== runIdRef.current) return;
        setState('running');
        const done = await pollTask(account, scheduled.id, { signal: ctrl.signal });
        if (runId !== runIdRef.current || ctrl.signal.aborted) return;
        taskIdRef.current = null;
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
        setError(describeMutationError(e));
        setState('failed');
      }
    },
    [account, taskTypes, textTaskType, cancelScheduled]
  );

  return { state, output, error, run, reset };
}
