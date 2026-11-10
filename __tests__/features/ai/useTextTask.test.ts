import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useTextTask } from '@/features/ai/useTextTask';
import {
  cancelTask,
  fetchTaskTypes,
  hasTextTaskType,
  pollTask,
  scheduleTask,
  TaskPollTimeout,
} from '@/services/nextcloud/taskprocessing';
import { HttpError } from '@/services/shared/errors';
import { setAccounts } from '@/hooks/useAccounts';
import { useAccountStore } from '@/stores/accountStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Account, TaskProcessingTask, TaskTypeInfo } from '@/types';

jest.mock(
  '@/services/nextcloud/taskprocessing',
  () => ({
    ...jest.requireActual('@/services/nextcloud/taskprocessing'),
    fetchTaskTypes: jest.fn(),
    scheduleTask: jest.fn(),
    getTask: jest.fn(),
    cancelTask: jest.fn(),
    pollTask: jest.fn(),
    hasTextTaskType: jest.fn(),
  }),
  { virtual: true }
);

const fetchTypes = fetchTaskTypes as jest.Mock;
const pickText = hasTextTaskType as jest.Mock;
const schedule = scheduleTask as jest.Mock;
const poll = pollTask as jest.Mock;
const cancel = cancelTask as jest.Mock;

const types: Record<string, TaskTypeInfo> = {
  'core:text2text': {
    name: 'Free text to text',
    description: '',
    inputShape: {},
    outputShape: {},
  },
};

function account(id: string): Account {
  return {
    id,
    displayName: 'Test',
    baseUrl: 'https://cloud.example.com',
    username: 'u',
    appPassword: 'p',
    davUserId: 'u',
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function activate(a: Account, ai: boolean) {
  setAccounts([a]);
  useAccountStore.getState().setActiveAccountId(a.id);
  useSettingsStore.getState().setAiEnabled(ai);
}

async function settleTaskTypes() {
  await waitFor(() => expect(fetchTypes).toHaveBeenCalled());
  await act(async () => {});
}

beforeEach(() => {
  jest.clearAllMocks();
  setAccounts([]);
  useAccountStore.getState().setActiveAccountId(null);
  useSettingsStore.getState().setAiEnabled(false);
  fetchTypes.mockResolvedValue(types);
  pickText.mockImplementation((t) =>
    t && Object.keys(t).length > 0 ? 'core:text2text' : null
  );
});

describe('useTextTask', () => {
  it('fails with a localized error when no text task type is available', async () => {
    activate(account('none-1'), false);
    const { result } = renderHook(() => useTextTask());
    await act(async () => {
      await result.current.run('prompt');
    });
    expect(result.current.state).toBe('failed');
    expect(result.current.error).toBeTruthy();
    expect(result.current.output).toBeNull();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('transitions scheduling → running → done and exposes the first string output', async () => {
    const a = account('ok-1');
    activate(a, true);
    const sched = deferred<TaskProcessingTask>();
    const polled = deferred<TaskProcessingTask>();
    schedule.mockReturnValue(sched.promise);
    poll.mockReturnValue(polled.promise);

    const { result } = renderHook(() => useTextTask());
    await settleTaskTypes();

    act(() => {
      void result.current.run('summarize me', { customId: 'day:1' });
    });
    expect(result.current.state).toBe('scheduling');
    expect(schedule).toHaveBeenCalledWith(a, 'core:text2text', { input: 'summarize me' }, 'day:1');

    await act(async () => {
      sched.resolve({ id: 7, type: 'core:text2text', status: 1 });
    });
    expect(result.current.state).toBe('running');
    expect(poll).toHaveBeenCalledWith(
      a,
      7,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );

    await act(async () => {
      polled.resolve({
        id: 7,
        type: 'core:text2text',
        status: 3,
        output: { output: 'A calm day', extra: 42 },
      });
    });
    expect(result.current.state).toBe('done');
    expect(result.current.output).toBe('A calm day');
    expect(result.current.error).toBeNull();
  });

  it('fails when the task ends with a terminal failure status', async () => {
    activate(account('st4-1'), true);
    schedule.mockResolvedValue({ id: 9, type: 'core:text2text', status: 1 });
    poll.mockResolvedValue({ id: 9, type: 'core:text2text', status: 4 });

    const { result } = renderHook(() => useTextTask());
    await settleTaskTypes();
    await act(async () => {
      await result.current.run('prompt');
    });
    expect(result.current.state).toBe('failed');
    expect(result.current.output).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it('fails when polling throws', async () => {
    activate(account('err-1'), true);
    schedule.mockResolvedValue({ id: 5, type: 'core:text2text', status: 1 });
    poll.mockRejectedValue(new HttpError(503, 'getTask'));

    const { result } = renderHook(() => useTextTask());
    await settleTaskTypes();
    await act(async () => {
      await result.current.run('prompt');
    });
    expect(result.current.state).toBe('failed');
    expect(result.current.error).toBeTruthy();
  });

  it('fails when a successful task has no string output slot', async () => {
    activate(account('empty-1'), true);
    schedule.mockResolvedValue({ id: 6, type: 'core:text2text', status: 1 });
    poll.mockResolvedValue({ id: 6, type: 'core:text2text', status: 3, output: { n: 1 } });

    const { result } = renderHook(() => useTextTask());
    await settleTaskTypes();
    await act(async () => {
      await result.current.run('prompt');
    });
    expect(result.current.state).toBe('failed');
    expect(result.current.output).toBeNull();
  });

  it('aborts polling on unmount and ignores the late result', async () => {
    activate(account('abort-1'), true);
    schedule.mockResolvedValue({ id: 11, type: 'core:text2text', status: 1 });
    let signal: AbortSignal | undefined;
    poll.mockImplementation((_a, _id, opts) => {
      signal = opts?.signal;
      return new Promise(() => {});
    });

    const { result, unmount } = renderHook(() => useTextTask());
    await settleTaskTypes();
    await act(async () => {
      void result.current.run('prompt');
      await Promise.resolve();
    });
    expect(result.current.state).toBe('running');
    expect(signal).toBeDefined();
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('reset aborts the in-flight poll and returns to idle', async () => {
    activate(account('reset-1'), true);
    schedule.mockResolvedValue({ id: 12, type: 'core:text2text', status: 1 });
    let signal: AbortSignal | undefined;
    const polled = deferred<TaskProcessingTask>();
    poll.mockImplementation((_a, _id, opts) => {
      signal = opts?.signal;
      return polled.promise;
    });

    const { result } = renderHook(() => useTextTask());
    await settleTaskTypes();
    await act(async () => {
      void result.current.run('prompt');
      await Promise.resolve();
    });
    expect(result.current.state).toBe('running');

    act(() => result.current.reset());
    expect(result.current.state).toBe('idle');
    expect(signal?.aborted).toBe(true);

    await act(async () => {
      polled.resolve({ id: 12, type: 'core:text2text', status: 3, output: { output: 'stale' } });
    });
    expect(result.current.state).toBe('idle');
    expect(result.current.output).toBeNull();
  });

  it('strips markdown emphasis markers but preserves literal __x__ text', async () => {
    activate(account('md-1'), true);
    schedule.mockResolvedValue({ id: 51, type: 'core:text2text', status: 1 });
    poll.mockResolvedValue({
      id: 51,
      type: 'core:text2text',
      status: 3,
      output: { output: 'Busy **morning**, discuss __init__ at https://x.co/__docs__/' },
    });

    const { result } = renderHook(() => useTextTask());
    await settleTaskTypes();
    await act(async () => {
      await result.current.run('prompt');
    });
    expect(result.current.output).toBe(
      'Busy morning, discuss __init__ at https://x.co/__docs__/'
    );
  });

  it('continues polling once when the first poll times out', async () => {
    activate(account('to-1'), true);
    schedule.mockResolvedValue({ id: 21, type: 'core:text2text', status: 1 });
    poll
      .mockRejectedValueOnce(new TaskPollTimeout({ id: 21, type: 'core:text2text', status: 2 }))
      .mockResolvedValueOnce({
        id: 21,
        type: 'core:text2text',
        status: 3,
        output: { output: 'late but done' },
      });

    const { result } = renderHook(() => useTextTask());
    await settleTaskTypes();
    await act(async () => {
      await result.current.run('prompt');
    });
    expect(poll).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe('done');
    expect(result.current.output).toBe('late but done');
  });

  it('fails and best-effort cancels the lingering task after a second timeout', async () => {
    activate(account('to-2'), true);
    schedule.mockResolvedValue({ id: 22, type: 'core:text2text', status: 1 });
    poll.mockRejectedValue(new TaskPollTimeout({ id: 22, type: 'core:text2text', status: 2 }));

    const { result } = renderHook(() => useTextTask());
    await settleTaskTypes();
    await act(async () => {
      await result.current.run('prompt');
    });
    expect(result.current.state).toBe('failed');
    expect(cancel).toHaveBeenCalledWith(expect.objectContaining({ id: 'to-2' }), 22);
  });

  it('cancels on the scheduling account when the user switches accounts mid-run', async () => {
    const a = account('sw-a');
    const b = account('sw-b');
    activate(a, true);
    schedule.mockResolvedValue({ id: 31, type: 'core:text2text', status: 1 });
    const polled = deferred<TaskProcessingTask>();
    poll.mockReturnValue(polled.promise);

    const { result } = renderHook(() => useTextTask());
    await settleTaskTypes();
    await act(async () => {
      void result.current.run('prompt');
      await Promise.resolve();
    });
    expect(result.current.state).toBe('running');

    await act(async () => {
      setAccounts([b]);
      useAccountStore.getState().setActiveAccountId(b.id);
    });
    // Task 31 lives on account A — cancelling on B would hit a foreign task.
    expect(cancel).toHaveBeenCalledWith(a, 31);
    expect(result.current.state).toBe('idle');
  });

  it('cancels a task that only resolves from schedule after the run was reset', async () => {
    const a = account('orph-1');
    activate(a, true);
    const sched = deferred<TaskProcessingTask>();
    schedule.mockReturnValue(sched.promise);

    const { result } = renderHook(() => useTextTask());
    await settleTaskTypes();
    await act(async () => {
      void result.current.run('prompt');
      await Promise.resolve();
    });
    expect(result.current.state).toBe('scheduling');

    act(() => result.current.reset());
    await act(async () => {
      sched.resolve({ id: 41, type: 'core:text2text', status: 1 });
      await Promise.resolve();
    });
    // The server-side task exists now but the run is dead — it must not leak.
    expect(cancel).toHaveBeenCalledWith(a, 41);
    expect(result.current.state).toBe('idle');
    expect(result.current.output).toBeNull();
  });
});
