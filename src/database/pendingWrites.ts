import { storage } from '@/storage';

/**
 * Event keys ("accountId|calendarId|uid") written locally but not yet pushed
 * to the server. Persisted in MMKV so the protection survives an app crash or
 * restart between the optimistic local write and the CalDAV push.
 *
 * Sync merges skip any remote operation touching a pending key: the un-pushed
 * local intent wins until the push resolves. Each entry carries a refcount so
 * a rolled-back mutation on the same key does not prematurely unprotect an
 * earlier write that is still awaiting its push.
 */
const STORAGE_KEY = 'pending_local_writes';

type PendingEntry = { count: number; ts: number };
type PendingMap = Record<string, PendingEntry>;

function readMap(): PendingMap {
    const raw = storage.getString(STORAGE_KEY);
    if (!raw) return {};
    try {
        const parsed: unknown = JSON.parse(raw);
        return typeof parsed === 'object' && parsed !== null ? (parsed as PendingMap) : {};
    } catch {
        return {};
    }
}

function writeMap(map: PendingMap): void {
    if (Object.keys(map).length === 0) {
        storage.remove(STORAGE_KEY);
    } else {
        storage.set(STORAGE_KEY, JSON.stringify(map));
    }
}

export function markPending(keys: readonly string[]): void {
    if (keys.length === 0) return;
    const map = readMap();
    const ts = Date.now();
    for (const k of keys) {
        const entry = map[k];
        map[k] = { count: (entry?.count ?? 0) + 1, ts: entry?.ts ?? ts };
    }
    writeMap(map);
}

export function releasePending(keys: readonly string[]): void {
    if (keys.length === 0) return;
    const map = readMap();
    for (const k of keys) {
        const entry = map[k];
        if (!entry) continue;
        if (entry.count <= 1) delete map[k];
        else map[k] = { ...entry, count: entry.count - 1 };
    }
    writeMap(map);
}

export function pendingKeys(): Set<string> {
    return new Set(Object.keys(readMap()));
}
