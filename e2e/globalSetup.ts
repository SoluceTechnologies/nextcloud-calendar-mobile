import { disableAnimations, installApp, runFlow, today } from './app';
import { allDay } from './ics';
import { ADMIN, E2E_CAL, Nextcloud, NextcloudContainer, SEED_TITLE, SEED_UID, locationOf } from './nextcloud';

/**
 * One server, one fresh install and one login for the whole run; suites attach through
 * E2E_NEXTCLOUD and start already logged in. Waiting for the seed also checks the initial sync.
 */
export default async function globalSetup(): Promise<void> {
  const [started] = await Promise.all([new NextcloudContainer().start(), installApp()]);
  (globalThis as { e2eNextcloud?: unknown }).e2eNextcloud = started;
  (globalThis as { e2eRestoreAnimations?: () => void }).e2eRestoreAnimations = disableAnimations();
  const where = locationOf(started);
  const nc = new Nextcloud(where);
  await nc.installApp('calendar');
  await nc.disableBruteforceProtection();
  await nc.setEmail(ADMIN.user, 'e2e@example.test');
  await nc.dav.createCalendar(E2E_CAL, 'E2E');
  await nc.dav.putEvent(E2E_CAL, SEED_UID, allDay({ uid: SEED_UID, summary: SEED_TITLE, day: today() }));
  runFlow(nc, 'shared/login-and-wait', { TITLE: SEED_TITLE });
  process.env.E2E_NEXTCLOUD = JSON.stringify(where);
}
