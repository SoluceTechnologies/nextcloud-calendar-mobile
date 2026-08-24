export async function settleAllOrThrow<T>(
    tasks: ReadonlyArray<() => Promise<T[]>>,
): Promise<T[]> {
    if (tasks.length === 0) return [];

    const results = await Promise.allSettled(tasks.map((task) => task()));

    const failures = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    if (failures.length > 0) {
        const error = new Error(`${failures.length}/${results.length} fetch(es) failed`);
        (error as Error & { failures: unknown[] }).failures = failures.map((f) => f.reason);
        throw error;
    }

    return (results as PromiseFulfilledResult<T[]>[]).flatMap((r) => r.value);
}
