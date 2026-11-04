import type { Account, TaskTypeInfo } from '@/types';
import { HttpError } from '@/services/shared/errors';
import {
    fetchTaskTypes,
    scheduleTask,
    pollTask,
    cancelTask,
    shapeTypeOf,
    TaskPollTimeout,
} from '@/services/nextcloud/taskprocessing';

type TaskAccount = Pick<Account, 'baseUrl' | 'username' | 'appPassword'>;

export const AGENT_TASK_TYPE = 'core:contextagent:interaction';
const POLL_TIMEOUT_MS = 45_000;
const COOLDOWN_MS = 60_000;
const TEXT_SLOT = 1; // OCP\TaskProcessing\ShapeEnum::Text

// Lazily fetched per account — the tasktypes payload is big enough that we don't
// want it on every app start, only when the assistant is actually used.
const taskTypesCache = new Map<string, Record<string, TaskTypeInfo> | null>();
const cooldownUntil = new Map<string, number>();

export function hasAgentTaskType(taskTypes: Record<string, TaskTypeInfo> | null | undefined): string | null {
    if (!taskTypes) return null;
    return taskTypes[AGENT_TASK_TYPE] ? AGENT_TASK_TYPE : null;
}

export async function isAgentAvailable(account: TaskAccount): Promise<boolean> {
    const key = account.baseUrl + account.username;
    if ((cooldownUntil.get(key) ?? 0) > Date.now()) return false;
    let types = taskTypesCache.get(key);
    if (types === undefined) {
        try {
            types = await fetchTaskTypes(account);
        } catch {
            types = null;
        }
        taskTypesCache.set(key, types);
    }
    return hasAgentTaskType(types) !== null;
}

export function invalidateAgentCache(account: TaskAccount): void {
    const key = account.baseUrl + account.username;
    taskTypesCache.delete(key);
    cooldownUntil.delete(key);
}

function firstTextSlot(output: Record<string, unknown> | null | undefined): string | null {
    if (!output) return null;
    for (const value of Object.values(output)) {
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (Array.isArray(value)) {
            const found = value.find((v) => typeof v === 'string' && v.trim());
            if (typeof found === 'string') return found.trim();
        }
    }
    return null;
}

// The input slot name varies across server versions — take the first Text slot
// advertised in inputShape instead of guessing.
function inputKeyOf(taskType: TaskTypeInfo): string {
    for (const [key, slot] of Object.entries(taskType.inputShape ?? {})) {
        if (shapeTypeOf(slot) === TEXT_SLOT) return key;
    }
    return 'input';
}

export class AgentError extends Error {
    constructor(
        public readonly reason: 'unavailable' | 'cooldown' | 'failed' | 'timeout' | 'noText',
        message: string,
    ) {
        super(message);
    }
}

/**
 * Sends a free-form prompt to the Nextcloud context agent and resolves with its
 * textual answer. Mutations performed by the agent happen server-side — the
 * caller should surface the answer text verbatim.
 */
export async function askAgent(
    account: TaskAccount,
    text: string,
    opts?: { signal?: AbortSignal },
): Promise<string> {
    const key = account.baseUrl + account.username;
    if ((cooldownUntil.get(key) ?? 0) > Date.now()) {
        throw new AgentError('cooldown', 'agent rate-limited, try again shortly');
    }

    const types = taskTypesCache.get(key) ?? (await fetchTaskTypes(account).catch(() => null));
    taskTypesCache.set(key, types);
    const taskTypeId = hasAgentTaskType(types);
    if (!taskTypeId) throw new AgentError('unavailable', 'context agent not advertised by server');

    const scheduled = await scheduleTask(account, taskTypeId, {
        [inputKeyOf(types![taskTypeId])]: text,
    }).catch((e) => {
        if (e instanceof HttpError && e.status === 429) {
            cooldownUntil.set(key, Date.now() + COOLDOWN_MS);
            throw new AgentError('cooldown', 'agent rate-limited by server');
        }
        throw e;
    });

    try {
        const done = await pollTask(account, scheduled.id, { timeoutMs: POLL_TIMEOUT_MS, signal: opts?.signal });
        if (done.status === 3) {
            const answer = firstTextSlot(done.output);
            if (!answer) throw new AgentError('noText', 'agent returned no text');
            return answer;
        }
        throw new AgentError('failed', done.message || `agent task ended with status ${done.status}`);
    } catch (e) {
        if (e instanceof TaskPollTimeout || (e as Error).name === 'AbortError') {
            try {
                await cancelTask(account, scheduled.id);
            } catch {
                // best effort
            }
            throw new AgentError('timeout', 'agent did not finish in time');
        }
        throw e;
    }
}
