export interface SettleResult<T> {
    values: T[];
    failures: unknown[];
    fulfilledIndexes: number[];
}

export async function settleAll<T>(
    tasks: ReadonlyArray<() => Promise<T[]>>,
): Promise<SettleResult<T>> {
    if (tasks.length === 0) return { values: [], failures: [], fulfilledIndexes: [] };

    const results = await Promise.allSettled(tasks.map((task) => task()));

    const values: T[] = [];
    const failures: unknown[] = [];
    const fulfilledIndexes: number[] = [];

    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            values.push(...result.value);
            fulfilledIndexes.push(index);
        } else {
            failures.push(result.reason);
        }
    });

    if (failures.length > 0) {
        console.warn(
            `[settleAll] ${failures.length}/${results.length} task(s) failed:`,
            failures.map((f) => String(f)).slice(0, 5),
        );
    }

    return { values, failures, fulfilledIndexes };
}
