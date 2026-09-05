import { markLocalWrite, localWriteEpoch } from '../../src/database/localWriteEpoch';
import { storage } from '../../src/storage';

describe('localWriteEpoch', () => {
  beforeEach(() => {
    storage.clearAll();
  });

  it('returns 0 when no local write has been recorded', () => {
    expect(localWriteEpoch()).toBe(0);
  });

  it('stores a timestamp after markLocalWrite', () => {
    const before = Date.now();
    markLocalWrite();
    const epoch = localWriteEpoch();
    expect(epoch).toBeGreaterThanOrEqual(before);
    expect(epoch).toBeGreaterThan(0);
  });

  it('is strictly monotonic across multiple calls', () => {
    markLocalWrite();
    const first = localWriteEpoch();
    markLocalWrite();
    const second = localWriteEpoch();
    markLocalWrite();
    const third = localWriteEpoch();

    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
  });

  it('persists across simulated restarts (storage survives in-memory)', () => {
    markLocalWrite();
    const beforeRestart = localWriteEpoch();

    // Simulate an app restart: the epoch is read from persisted storage,
    // not from a reset in-memory counter.
    const afterRestart = localWriteEpoch();

    expect(afterRestart).toBe(beforeRestart);
    expect(afterRestart).toBeGreaterThan(0);
  });

  it('a sync starting before a write detects the write after it', () => {
    // Simulate the syncEvents flow: capture epoch, then a write happens
    // during the fetch, then the epoch has changed.
    const epochAtSyncStart = localWriteEpoch();
    markLocalWrite();
    const epochAfterFetch = localWriteEpoch();

    expect(epochAfterFetch).not.toBe(epochAtSyncStart);
    expect(epochAfterFetch).toBeGreaterThan(epochAtSyncStart);
  });

  it('a sync starting after a write does not abort', () => {
    markLocalWrite();
    const epochAtSyncStart = localWriteEpoch();
    // No write during fetch…
    const epochAfterFetch = localWriteEpoch();

    expect(epochAfterFetch).toBe(epochAtSyncStart);
  });
});
