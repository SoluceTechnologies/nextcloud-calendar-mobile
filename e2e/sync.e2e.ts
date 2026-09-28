import { runFlow, setupSuite, today, uniqueTitle } from './app';
import { allDay, prop, veventsOf, weekly } from './ics';
import { E2E_CAL, SEED_TITLE } from './nextcloud';

const suite = setupSuite();

describe('server', () => {
  it('finds the seeded event and nothing else', async () => {
    expect(await suite.nc.dav.findEvent(SEED_TITLE)).not.toBeNull();
    expect(await suite.nc.dav.findEvent('E2E never-created')).toBeNull();
  });

  it('round-trips a weekly series with its RRULE', async () => {
    const title = uniqueTitle('o');
    await suite.nc.dav.putEvent(E2E_CAL, title, weekly({ uid: title, summary: title, day: new Date(), count: 3 }));
    const found = await suite.nc.dav.findEvent(title);
    expect(prop(veventsOf(found!)[0], 'RRULE')).toBe('FREQ=WEEKLY;COUNT=3');
  });

  it('keeps each user in their own calendars', async () => {
    const bob = await suite.nc.createUser({ user: 'oracle-bob', password: 'Bob-Oracle-Passw0rd-2026' });
    const title = uniqueTitle('o');
    await bob.createCalendar('bob-cal', 'Bob');
    await bob.putEvent('bob-cal', title, allDay({ uid: title, summary: title, day: new Date() }));
    expect(await bob.findEvent(title)).not.toBeNull();
    expect(await suite.nc.dav.findEvent(title)).toBeNull();
  });

  it('is unreachable while paused and back after unpause', async () => {
    await suite.nc.pause();
    try {
      await expect(fetch(`${suite.nc.url}/status.php`, { signal: AbortSignal.timeout(3000) })).rejects.toThrow();
    } finally {
      await suite.nc.unpause();
    }
    expect((await fetch(`${suite.nc.url}/status.php`)).ok).toBe(true);
  });

  it('surfaces occ failures', async () => {
    await expect(suite.nc.setPassword({ user: 'nobody-here', password: 'Whatever-Passw0rd-2026' })).rejects.toThrow(/occ/);
  });
});

describe('sync', () => {
  it('shows the seeded event after the initial sync @smoke', () => {
    runFlow(suite.nc, 'sync/initial');
  });

  it('shows an event created on the server after a relaunch', async () => {
    const title = uniqueTitle('n');
    runFlow(suite.nc, 'shared/home-and-wait', { TITLE: SEED_TITLE });
    await suite.nc.dav.putEvent(E2E_CAL, title, allDay({ uid: title, summary: title, day: today() }));
    runFlow(suite.nc, 'sync/relaunch-sees', { TITLE: title });
  });

  it('shows a server-side rename after a relaunch', async () => {
    const title = uniqueTitle('m');
    const renamed = `${title}r`;
    await suite.nc.dav.putEvent(E2E_CAL, title, allDay({ uid: title, summary: title, day: today() }));
    runFlow(suite.nc, 'shared/home-and-wait', { TITLE: title });
    await suite.nc.dav.putEvent(E2E_CAL, title, allDay({ uid: title, summary: renamed, day: today() }));
    runFlow(suite.nc, 'sync/relaunch-sees', { TITLE: renamed });
    runFlow(suite.nc, 'sync/relaunch-lost', { TITLE: title });
  });

  it('drops an event deleted on the server after a relaunch', async () => {
    const title = uniqueTitle('x');
    await suite.nc.dav.putEvent(E2E_CAL, title, allDay({ uid: title, summary: title, day: today() }));
    runFlow(suite.nc, 'shared/home-and-wait', { TITLE: title });
    await suite.nc.dav.deleteEvent(E2E_CAL, title);
    runFlow(suite.nc, 'sync/relaunch-lost', { TITLE: title });
  });

  it('hides and shows a calendar from the drawer', async () => {
    const title = uniqueTitle('h');
    await suite.nc.dav.createCalendar('second', 'Second');
    await suite.nc.dav.putEvent('second', title, allDay({ uid: title, summary: title, day: today() }));
    runFlow(suite.nc, 'sync/drawer-hide', { TITLE: title, CAL_NAME: 'Second' });
  });

  it('reaches an event six months ahead and comes back to today intact', async () => {
    const title = uniqueTitle('f');
    const now = today();
    const far = new Date(now.getFullYear(), now.getMonth() + 6, 15);
    await suite.nc.dav.putEvent(E2E_CAL, title, allDay({ uid: title, summary: title, day: far }));
    const farDay = `${far.getFullYear()}-${String(far.getMonth() + 1).padStart(2, '0')}-15`;
    runFlow(suite.nc, 'sync/far-future', { TITLE: title, FAR_DAY: farDay });
  });
});
