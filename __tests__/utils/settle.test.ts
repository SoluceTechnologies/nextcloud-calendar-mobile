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
