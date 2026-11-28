const pendingCounts = new Map<string, number>();

export function markPending(keys: readonly string[]): void {
    for (const key of keys) pendingCounts.set(key, (pendingCounts.get(key) ?? 0) + 1);
}

export function releasePending(keys: readonly string[]): void {
    for (const key of keys) {
        const count = pendingCounts.get(key);
        if (count === undefined) continue;
        if (count <= 1) pendingCounts.delete(key);
        else pendingCounts.set(key, count - 1);
    }
}

export function pendingKeys(): Set<string> {
    return new Set(pendingCounts.keys());
}
