import type { Account, TaskProcessingStatus, TaskProcessingTask, TaskTypeInfo } from '@/types';
import { httpErrorFrom } from '../shared/errors';
import { trustedFetch } from '../shared/trustedFetch';

type TaskAccount = Pick<Account, 'baseUrl' | 'username' | 'appPassword'>;

const APP_ID = 'calendar-mobile';
const TEXT_SLOT_TYPE = 1; // OCP\TaskProcessing\ShapeEnum::Text
const PREFERRED_TEXT_TYPES = ['core:text2text:summary', 'core:text2text'];
const TERMINAL_STATUSES = [3, 4, 5]; // successful, failed, cancelled

function basicAuth(account: Pick<Account, 'username' | 'appPassword'>): string {
  return 'Basic ' + btoa(`${account.username}:${account.appPassword}`);
}

function ocsHeaders(account: TaskAccount): Record<string, string> {
  return {
    Authorization: basicAuth(account),
    'OCS-APIRequest': 'true',
    Accept: 'application/json',
  };
}

const STATUS_BY_NAME: Record<string, TaskProcessingStatus> = {
  STATUS_UNKNOWN: 0,
  STATUS_SCHEDULED: 1,
  STATUS_RUNNING: 2,
  STATUS_SUCCESSFUL: 3,
  STATUS_FAILED: 4,
  STATUS_CANCELLED: 5,
};

// NC serializes status as int on older versions, STATUS_* string on newer ones.
function normalizeStatus(raw: unknown): TaskProcessingStatus {
  if (typeof raw === 'number' && raw >= 0 && raw <= 5) return raw as TaskProcessingStatus;
  if (typeof raw === 'string') return STATUS_BY_NAME[raw] ?? 0;
  return 0;
}

// Tolerates both `ocs.data.task` nested and flattened `ocs.data` task shapes.
function taskFrom(json: any, context: string): TaskProcessingTask {
  const data = json?.ocs?.data;
  const task = (data?.task ?? data) as TaskProcessingTask | undefined;
  if (!task || typeof task.id !== 'number') {
    throw new Error(`${context}: response carried no task`);
  }
  return { ...task, status: normalizeStatus(task.status) };
}

// NC serializes ShapeEnum as int on older versions, enum name on newer ones.
const SHAPE_TYPE_BY_NAME: Record<string, number> = {
  Text: 1,
  Number: 2,
  Enum: 3,
  File: 4,
  Image: 5,
  Audio: 6,
  Video: 7,
  ListOfTexts: 8,
  ListOfNumbers: 9,
  ListOfEnums: 10,
  ListOfFiles: 11,
  ListOfImages: 12,
  ListOfAudios: 13,
  ListOfVideos: 14,
};

export function shapeTypeOf(slot: { type?: number | string } | undefined): number {
  const t = slot?.type;
  if (typeof t === 'number') return t;
  if (typeof t === 'string') return SHAPE_TYPE_BY_NAME[t] ?? 0;
  return 0;
}

function isEligibleTextType(info: TaskTypeInfo | undefined): boolean {
  if (!info || info.isInternal) return false;
  const textIn = Object.values(info.inputShape ?? {}).some(
    (s) => shapeTypeOf(s) === TEXT_SLOT_TYPE
  );
  const textOut = Object.values(info.outputShape ?? {}).some(
    (s) => shapeTypeOf(s) === TEXT_SLOT_TYPE
  );
  return textIn && textOut;
}

export function hasTextTaskType(
  taskTypes: Record<string, TaskTypeInfo> | null | undefined
): string | null {
  if (!taskTypes) return null;
  for (const id of PREFERRED_TEXT_TYPES) {
    if (isEligibleTextType(taskTypes[id])) return id;
  }
  for (const [id, info] of Object.entries(taskTypes)) {
    if (isEligibleTextType(info)) return id;
  }
  return null;
}

export async function fetchTaskTypes(account: TaskAccount): Promise<Record<string, TaskTypeInfo>> {
  const url = `${account.baseUrl}/ocs/v2.php/taskprocessing/tasktypes`;
  const res = await trustedFetch(url, { headers: ocsHeaders(account) });
  if (!res.ok) throw httpErrorFrom(res, 'fetchTaskTypes');
  const json = await res.json();
  return (json?.ocs?.data?.types as Record<string, TaskTypeInfo> | undefined) ?? {};
}

export async function scheduleTask(
  account: TaskAccount,
  taskTypeId: string,
  input: Record<string, unknown>,
  customId?: string
): Promise<TaskProcessingTask> {
  const url = `${account.baseUrl}/ocs/v2.php/taskprocessing/schedule`;
  const res = await trustedFetch(url, {
    method: 'POST',
    headers: { ...ocsHeaders(account), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input,
      type: taskTypeId,
      appId: APP_ID,
      ...(customId ? { customId } : {}),
    }),
  });
  if (!res.ok) throw httpErrorFrom(res, 'scheduleTask');
  return taskFrom(await res.json(), 'scheduleTask');
}

export async function getTask(
  account: TaskAccount,
  taskId: number
): Promise<TaskProcessingTask | null> {
  const url = `${account.baseUrl}/ocs/v2.php/taskprocessing/task/${taskId}`;
  const res = await trustedFetch(url, { headers: ocsHeaders(account) });
  if (res.status === 404) return null;
  if (!res.ok) throw httpErrorFrom(res, 'getTask');
  return taskFrom(await res.json(), 'getTask');
}

export async function cancelTask(account: TaskAccount, taskId: number): Promise<void> {
  try {
    await trustedFetch(`${account.baseUrl}/ocs/v2.php/taskprocessing/task/${taskId}/cancel`, {
      method: 'POST',
      headers: ocsHeaders(account),
    });
  } catch {
    // best effort
  }
}

function abortError(): Error {
  const e = new Error('pollTask aborted');
  e.name = 'AbortError';
  return e;
}

// Thrown at the polling deadline while the task is still scheduled/running —
// distinct from a terminal task failure so callers can keep waiting or cancel.
export class TaskPollTimeout extends Error {
  task: TaskProcessingTask | null;
  constructor(task: TaskProcessingTask | null) {
    super(`pollTask: timeout, last status ${task?.status ?? 'unknown'}`);
    this.name = 'TaskPollTimeout';
    this.task = task;
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<'elapsed' | 'aborted'> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve('aborted');
      return;
    }
    const onAbort = () => {
      clearTimeout(t);
      signal?.removeEventListener('abort', onAbort);
      resolve('aborted');
    };
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve('elapsed');
    }, ms);
    signal?.addEventListener('abort', onAbort);
  });
}

export async function pollTask(
  account: TaskAccount,
  taskId: number,
  opts?: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal }
): Promise<TaskProcessingTask> {
  const intervalMs = opts?.intervalMs ?? 2800;
  const timeoutMs = opts?.timeoutMs ?? 40_000;
  const deadline = Date.now() + timeoutMs;
  let last: TaskProcessingTask | null = null;

  for (;;) {
    if (opts?.signal?.aborted) throw abortError();
    const task = await getTask(account, taskId);
    if (task === null) throw new Error('task purged');
    last = task;
    if (TERMINAL_STATUSES.includes(task.status)) return task;
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new TaskPollTimeout(last);
    if ((await sleep(Math.min(intervalMs, remaining), opts?.signal)) === 'aborted') {
      throw abortError();
    }
  }
}
