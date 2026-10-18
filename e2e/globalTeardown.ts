import type { StartedTestContainer } from 'testcontainers';

export default async function globalTeardown(): Promise<void> {
  const run = globalThis as { e2eNextcloud?: StartedTestContainer; e2eRestoreDevice?: () => void };
  run.e2eRestoreDevice?.();
  await run.e2eNextcloud?.stop();
}
