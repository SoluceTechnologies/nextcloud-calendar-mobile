import { runFlow, setupSuite, uniqueTitle } from './app';
import { SEED_TITLE } from './nextcloud';

const suite = setupSuite();

describe('offline', () => {
  // Creating is online-only (useCreateEvent rolls back and alerts on failure): no queue to replay.
  it('refuses to create an event in airplane mode and keeps nothing', async () => {
    const title = uniqueTitle('z');
    runFlow(suite.nc, 'offline/create-offline', { TITLE: title });
    expect(await suite.nc.dav.findEvent(title)).toBeNull();
  });

  it('stays usable on local data while the server is down', async () => {
    runFlow(suite.nc, 'shared/home-and-wait', { TITLE: SEED_TITLE });
    await suite.nc.pause();
    try {
      runFlow(suite.nc, 'offline/server-down');
    } finally {
      await suite.nc.unpause();
    }
  });
});
