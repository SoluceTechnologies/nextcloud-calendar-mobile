import { settleAll } from '@/utils/settle';

describe('settleAll', () => {
  it('returns an empty result when there are no tasks', async () => {
    await expect(settleAll([])).resolves.toEqual({
      values: [],
      failures: [],
      fulfilledIndexes: [],
    });
  });

  it('concatenates values when all tasks succeed, preserving order', async () => {
    const result = await settleAll<number>([
      () => Promise.resolve([1, 2]),
      () => Promise.resolve([]),
      () => Promise.resolve([3]),
    ]);
    expect(result.values).toEqual([1, 2, 3]);
    expect(result.failures).toEqual([]);
  });

  it('keeps the values of the tasks that resolved when one rejects', async () => {
    const result = await settleAll<number>([
      () => Promise.resolve([1]),
      () => Promise.reject(new Error('network down')),
      () => Promise.resolve([2]),
    ]);
    expect(result.values).toEqual([1, 2]);
  });

  it('reports the input index of every task that resolved', async () => {
    const result = await settleAll<number>([
      () => Promise.resolve([1]),
      () => Promise.reject(new Error('network down')),
      () => Promise.resolve([2]),
    ]);
    expect(result.fulfilledIndexes).toEqual([0, 2]);
  });

  it('collects the rejection reasons', async () => {
    const boom = new Error('timeout');
    const result = await settleAll<number>([
      () => Promise.resolve([1]),
      () => Promise.reject(boom),
    ]);
    expect(result.failures).toEqual([boom]);
  });

  it('returns no values and every reason when all tasks reject', async () => {
    const a = new Error('a');
    const b = new Error('b');
    const result = await settleAll<number>([
      () => Promise.reject(a),
      () => Promise.reject(b),
    ]);
    expect(result.values).toEqual([]);
    expect(result.fulfilledIndexes).toEqual([]);
    expect(result.failures).toEqual([a, b]);
  });
});

describe('settleAll concurrency', () => {
  it('limits the number of tasks running at once while preserving indexes', async () => {
    let running = 0;
    let maxRunning = 0;
    const tasks = Array.from({ length: 6 }, (_, index) => async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await Promise.resolve();
      running -= 1;
      return [index];
    });

    const result = await settleAll(tasks, 2);

    expect(maxRunning).toBe(2);
    expect(result.values).toEqual([0, 1, 2, 3, 4, 5]);
    expect(result.fulfilledIndexes).toEqual([0, 1, 2, 3, 4, 5]);
    expect(result.failures).toEqual([]);
  });

  it('continues later tasks after a failure', async () => {
    const started: number[] = [];
    const tasks = [0, 1, 2].map((index) => async () => {
      started.push(index);
      await Promise.resolve();
      if (index === 0) throw new Error('boom');
      return [index];
    });

    const result = await settleAll(tasks, 1);

    expect(started).toEqual([0, 1, 2]);
    expect(result.values).toEqual([1, 2]);
    expect(result.fulfilledIndexes).toEqual([1, 2]);
    expect(result.failures).toHaveLength(1);
  });
});
