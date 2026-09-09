import { storage } from '@/storage';

/**
 * Persisted monotonic timestamp marking the last local write.
 *
 * Replaces the in-memory counter that used to reset to 0 on every app launch.
 * By persisting the value in MMKV, a sync that starts after a crash/restart
 * can still detect that a local write happened in a previous session and
 * avoid clobbering it with stale remote data.
 *
 * The value is strictly monotonic: if two writes happen within the same
 * millisecond, the second one is stored as `prev + 1` so that the epoch
 * guard in {@link syncEvents} never misses a concurrent write.
 */
const LAST_WRITE_KEY = 'last_local_write_ms';

export function markLocalWrite(): void {
  const prev = storage.getNumber(LAST_WRITE_KEY) ?? 0;
  const now = Date.now();
  storage.set(LAST_WRITE_KEY, Math.max(now, prev + 1));
}

export function localWriteEpoch(): number {
  return storage.getNumber(LAST_WRITE_KEY) ?? 0;
}
