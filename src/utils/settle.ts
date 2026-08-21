export async function settleAllOrThrow<T>(
    tasks: ReadonlyArray<() => Promise<T[]>>,
): Promise<T[]> {
    if (tasks.length === 0) return [];

    const results = await Promise.allSettled(tasks.map((task) => task()));

    const failures = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    if (failures.length > 0) {
        console.warn(
            `[settleAllOrThrow] ${failures.length}/${results.length} fetch(es) failed:`,
            failures.map((f) => String(f.reason)).slice(0, 5),
        );
        const err = new Error(
            `[settleAllOrThrow] ${failures.length}/${results.length} fetch(es) failed`,
        ) as Error & { failures: unknown[] };
        err.failures = failures.map((f) => f.reason);
        throw err;
    }

    return (results as PromiseFulfilledResult<T[]>[]).flatMap((r) => r.value);
}
