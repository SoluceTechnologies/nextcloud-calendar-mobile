import {
  hasTextTaskType,
  fetchTaskTypes,
  scheduleTask,
  getTask,
  cancelTask,
  pollTask,
  TaskPollTimeout,
} from '@/services/nextcloud/taskprocessing';
import { trustedFetch } from '@/services/shared/trustedFetch';
import type { TaskTypeInfo } from '@/types';

jest.mock('@/services/shared/trustedFetch', () => ({
  ...jest.requireActual('@/services/shared/trustedFetch'),
  trustedFetch: jest.fn(),
}));

const fetchMock = trustedFetch as jest.Mock;

const account = { baseUrl: 'https://cloud.example.com', username: 'john', appPassword: 'xxxx' };

const TEXT = { name: 'text', description: '', type: 1, mandatory: true };
const IMAGE = { name: 'image', description: '', type: 0, mandatory: true };

function textType(overrides: Partial<TaskTypeInfo> = {}): TaskTypeInfo {
  return {
    name: 'Text',
    description: '',
    inputShape: { input: TEXT },
    outputShape: { output: TEXT },
    ...overrides,
  };
}

function httpResponse(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body ?? null),
    arrayBuffer: async () => new ArrayBuffer(0),
    base64: async () => '',
  };
}

const task = (id: number, status: number | string, extra: object = {}) => ({
  id,
  type: 'core:text2text',
  status,
  ...extra,
});
const ocsTask = (t: object) => ({ ocs: { data: { task: t } } });

beforeEach(() => fetchMock.mockReset());

describe('hasTextTaskType', () => {
  it('returns null for null/undefined/empty', () => {
    expect(hasTextTaskType(null)).toBeNull();
    expect(hasTextTaskType(undefined)).toBeNull();
    expect(hasTextTaskType({})).toBeNull();
  });

  it('prefers core:text2text:summary over core:text2text over others', () => {
    expect(
      hasTextTaskType({
        'custom:text': textType(),
        'core:text2text': textType(),
        'core:text2text:summary': textType(),
      })
    ).toBe('core:text2text:summary');
    expect(hasTextTaskType({ 'custom:text': textType(), 'core:text2text': textType() })).toBe(
      'core:text2text'
    );
  });

  it('falls back to the first non-internal text-in/text-out type', () => {
    expect(
      hasTextTaskType({
        'core:text2text:headline': textType({ isInternal: true }),
        'app:text:gen': textType(),
      })
    ).toBe('app:text:gen');
  });

  it('skips preferred types that are internal or lack text slots', () => {
    // An internal preferred id must not shadow a usable fallback.
    expect(
      hasTextTaskType({
        'core:text2text:summary': textType({ isInternal: true }),
        'core:text2text': textType(),
      })
    ).toBe('core:text2text');
    expect(
      hasTextTaskType({
        'core:text2text': textType({ outputShape: { image: IMAGE } }),
        'app:text:gen': textType(),
      })
    ).toBe('app:text:gen');
  });

  it('returns null when no usable text type exists', () => {
    expect(
      hasTextTaskType({
        'app:text2image': textType({ outputShape: { image: IMAGE } }),
        'app:internal': textType({ isInternal: true }),
      })
    ).toBeNull();
  });

  it('accepts NC35 string-serialized ShapeEnum names', () => {
    // NC >= 35 serializes slot type as 'Text'/'Enum'/… instead of int.
    const stringSlot = { name: 'in', description: '', type: 'Text' as const, mandatory: true };
    const enumSlot = { name: 'e', description: '', type: 'Enum' as const, mandatory: true };
    expect(
      hasTextTaskType({
        'core:text2text:summary': textType({
          inputShape: { input: stringSlot },
          outputShape: { output: stringSlot },
        }),
      })
    ).toBe('core:text2text:summary');
    // A text in/out type with extra non-text inputs (e.g. translate) still counts.
    expect(
      hasTextTaskType({
        'core:text2text:translate': textType({
          inputShape: { input: stringSlot, target_language: enumSlot },
          outputShape: { output: stringSlot },
        }),
      })
    ).toBe('core:text2text:translate');
    // String 'Audio'-only shapes don't qualify.
    const audioSlot = { name: 'a', description: '', type: 'Audio' as const, mandatory: true };
    expect(
      hasTextTaskType({
        'core:audio2audio': textType({
          inputShape: { input: audioSlot },
          outputShape: { output: audioSlot },
        }),
      })
    ).toBeNull();
  });
});

describe('fetchTaskTypes', () => {
  it('GETs the tasktypes endpoint with OCS auth headers and parses the map', async () => {
    fetchMock.mockResolvedValueOnce(
      httpResponse(200, { ocs: { data: { types: { 'core:text2text': textType() } } } })
    );
    const types = await fetchTaskTypes(account);
    expect(Object.keys(types)).toEqual(['core:text2text']);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://cloud.example.com/ocs/v2.php/taskprocessing/tasktypes');
    expect(init.headers).toMatchObject({
      Authorization: 'Basic ' + btoa('john:xxxx'),
      'OCS-APIRequest': 'true',
      Accept: 'application/json',
    });
  });

  it('returns {} when the response carries no types key', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(200, { ocs: { data: {} } }));
    expect(await fetchTaskTypes(account)).toEqual({});
  });

  it('throws an HttpError on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(500));
    await expect(fetchTaskTypes(account)).rejects.toThrow('fetchTaskTypes HTTP 500');
  });
});

describe('scheduleTask', () => {
  it('POSTs the schedule body and parses the nested ocs.data.task shape', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(200, ocsTask(task(7, 1))));
    const t = await scheduleTask(account, 'core:text2text', { input: 'hi' }, 'sum-1');
    expect(t.id).toBe(7);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://cloud.example.com/ocs/v2.php/taskprocessing/schedule');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      input: { input: 'hi' },
      type: 'core:text2text',
      appId: 'calendar-mobile',
      customId: 'sum-1',
    });
  });

  it('tolerates the flattened ocs.data task shape and omits customId when absent', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(200, { ocs: { data: task(9, 1) } }));
    const t = await scheduleTask(account, 'core:text2text', { input: 'hi' });
    expect(t.id).toBe(9);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('customId');
  });

  it('throws on 400', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(400));
    await expect(scheduleTask(account, 'x', {})).rejects.toThrow('scheduleTask HTTP 400');
  });

  it('normalizes STATUS_* string statuses to numbers (NC35)', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(200, ocsTask(task(7, 'STATUS_SCHEDULED'))));
    expect((await scheduleTask(account, 'x', {})).status).toBe(1);
    fetchMock.mockResolvedValueOnce(
      httpResponse(200, ocsTask(task(7, 'STATUS_SUCCESSFUL', { output: { output: 'ok' } })))
    );
    expect((await getTask(account, 7))?.status).toBe(3);
    fetchMock.mockResolvedValueOnce(httpResponse(200, ocsTask(task(7, 'STATUS_FAILED'))));
    expect((await getTask(account, 7))?.status).toBe(4);
    fetchMock.mockResolvedValueOnce(httpResponse(200, ocsTask(task(7, 'STATUS_SOMETHING_ELSE'))));
    expect((await getTask(account, 7))?.status).toBe(0);
  });
});

describe('getTask', () => {
  it('returns the task on 200', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(200, ocsTask(task(3, 2))));
    const t = await getTask(account, 3);
    expect(t?.status).toBe(2);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://cloud.example.com/ocs/v2.php/taskprocessing/task/3'
    );
  });

  it('returns null on 404 (purged)', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(404));
    expect(await getTask(account, 3)).toBeNull();
  });

  it('throws on other errors', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(500));
    await expect(getTask(account, 3)).rejects.toThrow('getTask HTTP 500');
  });
});

describe('cancelTask', () => {
  it('POSTs cancel and swallows non-2xx and network errors', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(500));
    await expect(cancelTask(account, 4)).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://cloud.example.com/ocs/v2.php/taskprocessing/task/4/cancel');
    expect(init.method).toBe('POST');

    fetchMock.mockRejectedValueOnce(new Error('Network request failed'));
    await expect(cancelTask(account, 4)).resolves.toBeUndefined();
  });
});

describe('pollTask', () => {
  const opts = { intervalMs: 1, timeoutMs: 200 };

  it('polls until a terminal status and resolves the task', async () => {
    fetchMock
      .mockResolvedValueOnce(httpResponse(200, ocsTask(task(5, 1))))
      .mockResolvedValueOnce(httpResponse(200, ocsTask(task(5, 2))))
      .mockResolvedValueOnce(
        httpResponse(200, ocsTask(task(5, 3, { output: { output: 'done' } })))
      );
    const t = await pollTask(account, 5, opts);
    expect(t.status).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws TaskPollTimeout carrying the last-known task on timeout', async () => {
    fetchMock.mockResolvedValue(httpResponse(200, ocsTask(task(5, 2))));
    const err = await pollTask(account, 5, { intervalMs: 1, timeoutMs: 15 }).then(
      () => {
        throw new Error('expected timeout');
      },
      (e) => e
    );
    expect(err).toBeInstanceOf(TaskPollTimeout);
    expect(err.task?.status).toBe(2);
  });

  it('throws when already aborted before starting', async () => {
    const c = new AbortController();
    c.abort();
    await expect(pollTask(account, 5, { ...opts, signal: c.signal })).rejects.toThrow(/abort/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when aborted between polls', async () => {
    const c = new AbortController();
    fetchMock.mockImplementation(async () => {
      c.abort();
      return httpResponse(200, ocsTask(task(5, 2)));
    });
    await expect(
      pollTask(account, 5, { intervalMs: 1, timeoutMs: 5000, signal: c.signal })
    ).rejects.toThrow(/abort/i);
  });

  it("throws 'task purged' when the task disappears (404)", async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(200, ocsTask(task(5, 2))));
    fetchMock.mockResolvedValueOnce(httpResponse(404));
    await expect(pollTask(account, 5, opts)).rejects.toThrow('task purged');
  });

  it('resolves immediately on a STATUS_* string terminal status', async () => {
    fetchMock.mockResolvedValueOnce(
      httpResponse(200, ocsTask(task(5, 'STATUS_SUCCESSFUL', { output: { output: 'done' } })))
    );
    const t = await pollTask(account, 5, opts);
    expect(t.status).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats failed (4) and cancelled (5) as terminal', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(200, ocsTask(task(5, 4))));
    expect((await pollTask(account, 5, opts)).status).toBe(4);
    fetchMock.mockResolvedValueOnce(httpResponse(200, ocsTask(task(5, 5))));
    expect((await pollTask(account, 5, opts)).status).toBe(5);
  });
});
