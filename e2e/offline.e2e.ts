import { eventually, runFlow, setupSuite, uniqueTitle } from './app';
import { SEED_TITLE } from './nextcloud';

const suite = setupSuite();

describe('offline', () => {
  it('pushes an event created in airplane mode once the network is back', async () => {
    const title = uniqueTitle('z');
    runFlow(suite.nc, 'offline/create-offline', { TITLE: title });
    const found = await eventually(() => suite.nc.dav.findEvent(title), (v) => v !== null);
    expect(found).not.toBeNull();
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
