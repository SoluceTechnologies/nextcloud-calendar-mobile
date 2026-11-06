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
const POLL_TIMEOUT_MS = 120_000;
const COOLDOWN_MS = 60_000;
const TEXT_SLOT = 1; // OCP\TaskProcessing\ShapeEnum::Text

// Lazily fetched per account — the tasktypes payload is big enough that we don't
// want it on every app start, only when the assistant is actually used. Only
// successful discoveries are cached; a network failure just defers the next
// attempt briefly so a transient outage does not disable the agent for good.
const FAILED_RETRY_MS = 60_000;
const taskTypesCache = new Map<string, Record<string, TaskTypeInfo>>();
const failedUntil = new Map<string, number>();
const cooldownUntil = new Map<string, number>();
// conversation_token returned by the last interaction, per account — sending it
// back lets the agent keep conversational context across turns.
const conversations = new Map<string, string>();

export function hasAgentTaskType(taskTypes: Record<string, TaskTypeInfo> | null | undefined): string | null {
    if (!taskTypes) return null;
    return taskTypes[AGENT_TASK_TYPE] ? AGENT_TASK_TYPE : null;
}

export async function isAgentAvailable(account: TaskAccount): Promise<boolean> {
    const key = account.baseUrl + account.username;
    if ((cooldownUntil.get(key) ?? 0) > Date.now()) return false;
    if ((failedUntil.get(key) ?? 0) > Date.now()) return false;
    let types = taskTypesCache.get(key);
    if (types === undefined) {
        try {
            types = await fetchTaskTypes(account);
            taskTypesCache.set(key, types);
        } catch {
            failedUntil.set(key, Date.now() + FAILED_RETRY_MS);
            return false;
        }
    }
    return hasAgentTaskType(types) !== null;
}

export function invalidateAgentCache(account: TaskAccount): void {
    const key = account.baseUrl + account.username;
    taskTypesCache.delete(key);
    failedUntil.delete(key);
    cooldownUntil.delete(key);
    conversations.delete(key);
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

const TOKEN_KEY = /token/i;
const NUMBER_SLOT = 2; // ShapeEnum::Number — e.g. confirmation (0 = nothing confirmed)
const ENUM_SLOT = 3; // ShapeEnum::Enum
const LIST_SLOT_MIN = 8; // ShapeEnum::ListOf* ids start at 8

// The prompt lands in the first required Text slot whose name isn't token-like.
// Every other required slot must still be sent — NC rejects the schedule with
// "Missing key" otherwise (verified against NC 35 contextagent:interaction).
function buildAgentInput(
    taskType: TaskTypeInfo,
    text: string,
    token: string,
): Record<string, unknown> {
    const input: Record<string, unknown> = {};
    let promptSent = false;
    for (const [key, slot] of Object.entries(taskType.inputShape ?? {})) {
        const type = shapeTypeOf(slot);
        if (type === TEXT_SLOT && !promptSent && !TOKEN_KEY.test(key)) {
            input[key] = text;
            promptSent = true;
        } else if (type === TEXT_SLOT) {
            input[key] = TOKEN_KEY.test(key) ? token : '';
        } else if (type === NUMBER_SLOT) {
            input[key] = 0;
        } else if (type === ENUM_SLOT) {
            input[key] = taskType.inputShapeEnumValues?.[key]?.[0]?.value ?? 0;
        } else if (type >= LIST_SLOT_MIN) {
            input[key] = [];
        }
        // File/Image/Audio/Video required slots have no safe default — the
        // context agent only requires Text/Number in practice.
    }
    if (!promptSent) input[inputKeyOf(taskType)] = text;
    // Replies are always read aloud — ask for speech formatting when advertised.
    if (shapeTypeOf(taskType.optionalInputShape?.output_mode) === TEXT_SLOT) {
        input.output_mode = 'speech';
    }
    return input;
}

// Reads the answer from the Text slot declared in outputShape — the payload
// also carries conversation_token and actions strings and slot order isn't
// guaranteed. Falls back to the first non-empty string for exotic servers.
function answerFrom(taskType: TaskTypeInfo, output: Record<string, unknown> | null): string | null {
    if (!output) return null;
    for (const [key, slot] of Object.entries(taskType.outputShape ?? {})) {
        if (shapeTypeOf(slot) !== TEXT_SLOT || TOKEN_KEY.test(key)) continue;
        const value = output[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return firstTextSlot(output);
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

    let types = taskTypesCache.get(key);
    if (types === undefined) {
        types = await fetchTaskTypes(account).catch(() => undefined);
        if (!types) {
            failedUntil.set(key, Date.now() + FAILED_RETRY_MS);
            throw new AgentError('unavailable', 'context agent discovery failed');
        }
        taskTypesCache.set(key, types);
    }
    const taskTypeId = hasAgentTaskType(types);
    if (!taskTypeId) throw new AgentError('unavailable', 'context agent not advertised by server');

    const taskType = types![taskTypeId];
    const scheduled = await scheduleTask(
        account,
        taskTypeId,
        buildAgentInput(taskType, text, conversations.get(key) ?? ''),
    ).catch((e) => {
        if (e instanceof HttpError && e.status === 429) {
            cooldownUntil.set(key, Date.now() + COOLDOWN_MS);
            throw new AgentError('cooldown', 'agent rate-limited by server');
        }
        throw e;
    });

    try {
        const done = await pollTask(account, scheduled.id, { timeoutMs: POLL_TIMEOUT_MS, signal: opts?.signal });
        if (done.status === 3) {
            const token = done.output?.conversation_token;
            if (typeof token === 'string' && token) conversations.set(key, token);
            const answer = answerFrom(taskType, done.output ?? null);
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
