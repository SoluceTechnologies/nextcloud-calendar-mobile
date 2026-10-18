import type { StartedTestContainer } from 'testcontainers';

export default async function globalTeardown(): Promise<void> {
  const run = globalThis as { e2eNextcloud?: StartedTestContainer; e2eRestoreAnimations?: () => void };
  run.e2eRestoreAnimations?.();
  await run.e2eNextcloud?.stop();
}
