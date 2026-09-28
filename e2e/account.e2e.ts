import { runFlow, setupSuite, today, uniqueTitle } from './app';
import { allDay } from './ics';
import { E2E_CAL } from './nextcloud';

const suite = setupSuite();

describe('account', () => {
  it('logs in with server URL, user and password @smoke', () => {
    runFlow(suite.nc, 'account/login');
  });

  it('rejects a wrong password and stays on setup', () => {
    runFlow(suite.nc, 'account/login-error', { NC_PASS: 'Wrong-Passw0rd-2026' });
  });

  it('reports an unreachable server and stays on setup', () => {
    runFlow(suite.nc, 'account/login-error', { NC_URL: 'http://10.0.2.2:1' });
  });

  it('lands on the calendar after a relaunch', () => {
    runFlow(suite.nc, 'account/relaunch-home');
  });

  it('switches accounts without leaking events', async () => {
    const bob = await suite.nc.createUser({ user: 'bob', password: 'Bob-E2e-Passw0rd-2026' });
    const aTitle = uniqueTitle('a');
    const bTitle = uniqueTitle('b');
    await suite.nc.dav.putEvent(E2E_CAL, aTitle, allDay({ uid: aTitle, summary: aTitle, day: today() }));
    await bob.createCalendar('bob-cal', 'Bob');
    await bob.putEvent('bob-cal', bTitle, allDay({ uid: bTitle, summary: bTitle, day: today() }));
    runFlow(suite.nc, 'account/add-and-switch', {
      A_TITLE: aTitle, B_TITLE: bTitle, B_USER: bob.creds.user, B_PASS: bob.creds.password,
    });
  });

  it('reconnects after password change + session revocation and keeps local data', async () => {
    const carol = await suite.nc.createUser({ user: 'carol', password: 'Carol-E2e-Passw0rd-2026' });
    const before = uniqueTitle('r');
    await carol.createCalendar('carol-cal', 'Carol');
    await carol.putEvent('carol-cal', before, allDay({ uid: before, summary: before, day: today() }));
    runFlow(suite.nc, 'shared/login-and-wait', { NC_USER: 'carol', NC_PASS: carol.creds.password, TITLE: before });

    const newPass = 'Carol-E2e-Changed-2026';
    await suite.nc.setPassword({ user: 'carol', password: newPass });
    await suite.nc.revokeSessions('carol');
    const after = uniqueTitle('s');
    await suite.nc.as({ user: 'carol', password: newPass })
      .putEvent('carol-cal', after, allDay({ uid: after, summary: after, day: today() }));
    runFlow(suite.nc, 'account/reconnect', { NEW_PASS: newPass, BEFORE_TITLE: before, AFTER_TITLE: after });
  });

  it('removes the only account and returns to setup', () => {
    runFlow(suite.nc, 'account/delete');
  });
});
