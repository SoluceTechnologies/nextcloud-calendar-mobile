import { HttpError } from '@/services/shared/errors';

const mockFetchTaskTypes = jest.fn();
const mockScheduleTask = jest.fn();
const mockPollTask = jest.fn();
const mockCancelTask = jest.fn();

jest.mock('@/services/nextcloud/taskprocessing', () => {
    class TaskPollTimeoutMock extends Error {
        name = 'TaskPollTimeout';
        constructor() {
            super('timeout');
        }
    }
    return {
        fetchTaskTypes: (...a: unknown[]) => mockFetchTaskTypes(a[0]),
        scheduleTask: (...a: unknown[]) => mockScheduleTask(a[0], a[1], a[2]),
        pollTask: (...a: unknown[]) => mockPollTask(a[0], a[1], a[2]),
        cancelTask: (...a: unknown[]) => mockCancelTask(a[0], a[1]),
        getTask: jest.fn(),
        hasTextTaskType: jest.fn(),
        shapeTypeOf: (slot: { type?: number | string }) =>
            typeof slot?.type === 'string' ? { Text: 1, Audio: 6 }[slot.type] ?? 0 : slot?.type ?? 0,
        TaskPollTimeout: TaskPollTimeoutMock,
    };
});

import { TaskPollTimeout } from '@/services/nextcloud/taskprocessing';
import {
    askAgent,
    isAgentAvailable,
    hasAgentTaskType,
    invalidateAgentCache,
    AGENT_TASK_TYPE,
} from '@/services/voice/agent';

const account = { baseUrl: 'https://nc.test', username: 'u', appPassword: 'p' };

const agentTypes = {
    [AGENT_TASK_TYPE]: {
        name: 'Context Agent',
        description: '',
        inputShape: { input: { name: 'Input', description: '', type: 'Text', mandatory: true } },
        outputShape: { output: { name: 'Out', description: '', type: 'Text', mandatory: true } },
    },
    'core:audio2text': {
        name: 'stt',
        description: '',
        inputShape: { audio: { name: 'a', description: '', type: 'Audio', mandatory: true } },
        outputShape: {},
    },
};

describe('hasAgentTaskType', () => {
    it('detects the interaction task type and only that one', () => {
        expect(hasAgentTaskType(agentTypes)).toBe(AGENT_TASK_TYPE);
        expect(hasAgentTaskType({ 'core:audio2text': agentTypes['core:audio2text'] })).toBeNull();
        expect(hasAgentTaskType(null)).toBeNull();
        expect(hasAgentTaskType({})).toBeNull();
    });
});

describe('isAgentAvailable', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        invalidateAgentCache(account);
    });

    it('is true only when the server advertises the task type', async () => {
        mockFetchTaskTypes.mockResolvedValueOnce(agentTypes);
        await expect(isAgentAvailable(account)).resolves.toBe(true);

        invalidateAgentCache(account);
        mockFetchTaskTypes.mockResolvedValueOnce({});
        await expect(isAgentAvailable(account)).resolves.toBe(false);
    });

    it('is false (not a throw) when tasktypes fetch fails', async () => {
        mockFetchTaskTypes.mockRejectedValueOnce(new HttpError(500, 'tasktypes'));
        await expect(isAgentAvailable(account)).resolves.toBe(false);
    });

    it('a failed discovery is retried after a short window, not cached forever', async () => {
        jest.useFakeTimers().setSystemTime(1_000);
        mockFetchTaskTypes.mockRejectedValueOnce(new HttpError(500, 'tasktypes'));
        await expect(isAgentAvailable(account)).resolves.toBe(false);
        // inside the retry window → no refetch, still unavailable
        jest.setSystemTime(30_000);
        await expect(isAgentAvailable(account)).resolves.toBe(false);
        expect(mockFetchTaskTypes).toHaveBeenCalledTimes(1);
        // after the window → refetch succeeds and the agent recovers
        jest.setSystemTime(70_000);
        mockFetchTaskTypes.mockResolvedValueOnce(agentTypes);
        await expect(isAgentAvailable(account)).resolves.toBe(true);
        jest.useRealTimers();
    });

    it('caches per account — second call skips the fetch', async () => {
        mockFetchTaskTypes.mockResolvedValueOnce(agentTypes);
        await isAgentAvailable(account);
        await isAgentAvailable(account);
        expect(mockFetchTaskTypes).toHaveBeenCalledTimes(1);
    });
});

describe('askAgent', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        invalidateAgentCache(account);
        mockFetchTaskTypes.mockResolvedValue(agentTypes);
    });

    it('schedules on the advertised TEXT input slot and returns the text answer', async () => {
        mockScheduleTask.mockResolvedValueOnce({ id: 42, type: AGENT_TASK_TYPE, status: 1 });
        mockPollTask.mockResolvedValueOnce({ id: 42, status: 3, output: { output: 'Vous êtes libre jeudi.' } });
        await expect(askAgent(account, 'suis-je libre jeudi ?')).resolves.toBe('Vous êtes libre jeudi.');
        expect(mockScheduleTask).toHaveBeenCalledWith(account, AGENT_TASK_TYPE, { input: 'suis-je libre jeudi ?' });
        expect(mockPollTask).toHaveBeenCalledWith(account, 42, expect.objectContaining({ timeoutMs: 45_000 }));
    });

    it('extracts text from a ListOfTexts-shaped output too', async () => {
        mockScheduleTask.mockResolvedValueOnce({ id: 7, status: 1 });
        mockPollTask.mockResolvedValueOnce({ id: 7, status: 3, output: { items: ['a', 'b'] } });
        await expect(askAgent(account, 'q')).resolves.toBe('a');
    });

    it('rejects with unavailable when the task type is missing', async () => {
        mockFetchTaskTypes.mockResolvedValue({});
        await expect(askAgent(account, 'q')).rejects.toMatchObject({ reason: 'unavailable' });
        expect(mockScheduleTask).not.toHaveBeenCalled();
    });

    it('maps 429 to cooldown and short-circuits the next call', async () => {
        mockScheduleTask.mockRejectedValueOnce(new HttpError(429, 'schedule'));
        await expect(askAgent(account, 'q')).rejects.toMatchObject({ reason: 'cooldown' });
        await expect(askAgent(account, 'q2')).rejects.toMatchObject({ reason: 'cooldown' });
        expect(mockScheduleTask).toHaveBeenCalledTimes(1);
    });

    it('failed task → AgentError failed with the task message', async () => {
        mockScheduleTask.mockResolvedValueOnce({ id: 9, status: 1 });
        mockPollTask.mockResolvedValueOnce({ id: 9, status: 4, message: 'provider down' });
        await expect(askAgent(account, 'q')).rejects.toMatchObject({ reason: 'failed', message: 'provider down' });
    });

    it('poll timeout → AgentError timeout + best-effort cancel', async () => {
        mockScheduleTask.mockResolvedValueOnce({ id: 11, status: 1 });
        mockPollTask.mockRejectedValueOnce(new TaskPollTimeout(null));
        await expect(askAgent(account, 'q')).rejects.toMatchObject({ reason: 'timeout' });
        expect(mockCancelTask).toHaveBeenCalledWith(account, 11);
    });
});
