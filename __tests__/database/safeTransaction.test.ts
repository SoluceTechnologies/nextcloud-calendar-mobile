import { safeWrite } from '../../src/database/utils/safeTransaction';

describe('safeWrite', () => {
  it('passes the operation name to WatermelonDB for queue diagnostics', async () => {
    const write = jest.fn(async (operation: () => Promise<string>) => operation());
    const db = { write };

    await expect(safeWrite(db as never, async () => 'done', 1000, 'test-write')).resolves.toBe('done');
    expect(write).toHaveBeenCalledWith(expect.any(Function), 'test-write');
  });

  it('does not reject a long write while the underlying writer is still running', async () => {
    jest.useFakeTimers();
    let finish: (() => void) | undefined;
    const write = jest.fn((operation: () => Promise<void>) => operation());
    const db = { write };

    const promise = safeWrite(
      db as never,
      () => new Promise<void>((resolve) => { finish = resolve; }),
      10,
      'slow-write',
    );
    const rejection = promise.then(
      () => false,
      () => true,
    );

    jest.advanceTimersByTime(10_000);
    expect(write).toHaveBeenCalledTimes(1);

    finish?.();
    await expect(promise).resolves.toBeUndefined();
    await expect(rejection).resolves.toBe(false);
    jest.useRealTimers();
  });
});
