import { emulatorTimezone, eventually, runFlow, setupSuite, today, uidOf, uniqueTitle, zonedToUtc } from './app';
import { prop, timed, veventsOf } from './ics';
import { E2E_CAL } from './nextcloud';

const suite = setupSuite();

// The app's write reaches the server asynchronously after the flow returns.
function serverHas(title: string, done: (ics: string) => boolean = () => true): Promise<string | null> {
  return eventually(() => suite.nc.dav.findEvent(title), (ics) => ics !== null && done(ics));
}

describe('event availability and status (#377)', () => {
  it('writes TRANSP and STATUS picked in the form to the server', async () => {
    const title = uniqueTitle('ts');
    runFlow(suite.nc, 'event/transp-status', { TITLE: title, TRANSP: 'transparent', STATUS: 'tentative' });
    const ev = veventsOf((await serverHas(title))!)[0];
    expect(prop(ev, 'TRANSP')).toBe('TRANSPARENT');
    expect(prop(ev, 'STATUS')).toBe('TENTATIVE');
  });

  it('persists a status change to cancelled through the edit form', async () => {
    const title = uniqueTitle('tc');
    const tz = emulatorTimezone();
    await suite.nc.dav.putEvent(E2E_CAL, uidOf(title), timed({
      uid: title, summary: title, start: zonedToUtc(today(), 10, 0, tz), end: zonedToUtc(today(), 11, 0, tz),
    }));
    runFlow(suite.nc, 'event/status-edit', { TITLE: title, STATUS: 'cancelled' });
    const ev = veventsOf((await serverHas(title))!)[0];
    expect(prop(ev, 'STATUS')).toBe('CANCELLED');
  });
});
