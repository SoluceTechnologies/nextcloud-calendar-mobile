export interface SettleResult<T> {
    values: T[];
    failures: unknown[];
    fulfilledIndexes: number[];
}

export async function settleAll<T>(
    tasks: ReadonlyArray<() => Promise<T[]>>,
    concurrency: number = tasks.length,
): Promise<SettleResult<T>> {
    if (tasks.length === 0) return { values: [], failures: [], fulfilledIndexes: [] };

    const results: (
        | { status: 'fulfilled'; value: T[] }
        | { status: 'rejected'; reason: unknown }
    )[] = new Array(tasks.length);
    let nextIndex = 0;

    const worker = async () => {
        for (;;) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= tasks.length) return;
            try {
                results[index] = { status: 'fulfilled', value: await tasks[index]() };
            } catch (reason) {
                results[index] = { status: 'rejected', reason };
            }
        }
    };

    await Promise.all(
        Array.from({ length: Math.max(1, Math.min(concurrency, tasks.length)) }, () => worker()),
    );

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
