import { Database } from '@nozbe/watermelondb';

export async function safeWrite<T>(
  database: Database,
  operation: () => Promise<T>,
  timeoutMs: number = 10000,
  operationName: string = 'unnamed'
): Promise<T> {
  const startedAt = Date.now();

  try {
    const result = await database.write(operation, operationName);
    const duration = Date.now() - startedAt;
    if (duration > timeoutMs) {
      console.warn(`Database write operation "${operationName}" was slow (${duration}ms)`);
    }
    return result;
  } catch (err) {
    console.error(
      `Failed database write operation "${operationName}" after ${Date.now() - startedAt}ms:`,
      String(err),
    );
    throw err;
  }
}
