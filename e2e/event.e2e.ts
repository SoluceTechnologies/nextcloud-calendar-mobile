import { emulatorTimezone, eventually, runFlow, setupSuite, today, uidOf, uniqueTitle, zonedToUtc } from './app';
import { allDay, prop, timed, utcStamp, veventsOf, weekly } from './ics';
import { E2E_CAL } from './nextcloud';

const suite = setupSuite();

// A flow ends once the app shows its change; the app's write to the server may still be in flight.
function serverHas(title: string, done: (ics: string) => boolean = () => true): Promise<string | null> {
  return eventually(() => suite.nc.dav.findEvent(title), (ics) => ics !== null && done(ics));
}

function serverLacks(title: string): Promise<string | null> {
  return eventually(() => suite.nc.dav.findEvent(title), (ics) => ics === null);
}

function instantOf(vevent: string, name: string): string | undefined {
  const m = vevent.match(new RegExp(`^${name}(?:;TZID=([^:;]+))?:(\\d{4})(\\d{2})(\\d{2})T(\\d{2})(\\d{2})\\d{2}(Z?)`, 'm'));
  if (!m) return undefined;
  const [line, tzid, y, mo, d, h, mi, z] = m;
  if (z) return line.slice(line.indexOf(':') + 1);
  return utcStamp(zonedToUtc(new Date(+y, +mo - 1, +d), +h, +mi, tzid ?? 'UTC'));
}

async function seedWeekly(prefix: string): Promise<string> {
  const title = uniqueTitle(prefix);
  await suite.nc.dav.putEvent(E2E_CAL, uidOf(title), weekly({ uid: uidOf(title), summary: title, day: today(), count: 4 }));
  return title;
}

describe('event', () => {
  it('creates an all-day event that survives a relaunch and reaches the server @smoke', async () => {
    const title = uniqueTitle('c');
    runFlow(suite.nc, 'event/create-persist', { TITLE: title });
    expect(await serverHas(title)).not.toBeNull();
  });

  it('deletes an event that never comes back @smoke', async () => {
    const title = uniqueTitle('d');
    await suite.nc.dav.putEvent(E2E_CAL, title, allDay({ uid: title, summary: title, day: today() }));
    runFlow(suite.nc, 'event/delete', { TITLE: title });
    expect(await serverLacks(title)).toBeNull();
    runFlow(suite.nc, 'sync/relaunch-lost', { TITLE: title });
    expect(await suite.nc.dav.findEvent(title)).toBeNull();
  });

  it('creates a weekly series', async () => {
    const title = uniqueTitle('w');
    runFlow(suite.nc, 'event/create-weekly', { TITLE: title });
    const ev = await serverHas(title);
    expect(prop(veventsOf(ev!)[0], 'RRULE')).toMatch(/^FREQ=WEEKLY/);
  });

  it('renames one occurrence without touching the series', async () => {
    const title = await seedWeekly('o');
    const renamed = `${title}r`;
    runFlow(suite.nc, 'event/edit-occurrence', { TITLE: title, NEW_TITLE: renamed });
    const override = await serverHas(renamed);
    expect(prop(veventsOf(override!)[0], 'RECURRENCE-ID')).toBeDefined();
    const master = await suite.nc.dav.findEvent(title);
    expect(prop(veventsOf(master!)[0], 'RRULE')).toMatch(/^FREQ=WEEKLY/);
  });

  it('deletes one occurrence and keeps the series', async () => {
    const title = await seedWeekly('p');
    runFlow(suite.nc, 'event/delete-occurrence', { TITLE: title });
    const master = await serverHas(title, (ics) => /^EXDATE/m.test(ics));
    expect(master).not.toBeNull();
    expect(prop(veventsOf(master!)[0], 'EXDATE')).toBeDefined();
  });

  it('deletes a whole series', async () => {
    const title = await seedWeekly('q');
    runFlow(suite.nc, 'event/delete-series', { TITLE: title });
    expect(await serverLacks(title)).toBeNull();
  });

  it('writes a 15 minute reminder', async () => {
    const title = uniqueTitle('l');
    runFlow(suite.nc, 'event/add-alert', { TITLE: title });
    const ev = await serverHas(title);
    expect(ev).toMatch(/BEGIN:VALARM[\s\S]*TRIGGER[^:]*:-PT15M[\s\S]*END:VALARM/);
  });

  it('shows a join button for a Talk link in the location', async () => {
    const title = uniqueTitle('v');
    const location = 'https://cloud.example.test/call/e2eroom1';
    runFlow(suite.nc, 'event/visio-link', { TITLE: title, LOCATION: location });
    expect(prop(veventsOf((await serverHas(title))!)[0], 'LOCATION')).toBe(location);
  });

  it('writes organizer and attendee together', async () => {
    const title = uniqueTitle('g');
    runFlow(suite.nc, 'event/add-attendee', { TITLE: title, ATTENDEE: 'alice@example.test' });
    const ev = veventsOf((await serverHas(title))!)[0];
    expect(prop(ev, 'ATTENDEE')).toMatch(/mailto:alice@example\.test/i);
    expect(prop(ev, 'ORGANIZER')).toMatch(/mailto:e2e@example\.test/i);
  });

  it('writes a timed event at the chosen local time', async () => {
    const title = uniqueTitle('t');
    runFlow(suite.nc, 'event/create-timed', { TITLE: title });
    const tz = emulatorTimezone();
    const ev = veventsOf((await serverHas(title))!)[0];
    expect(instantOf(ev, 'DTSTART')).toBe(utcStamp(zonedToUtc(today(), 10, 0, tz)));
    expect(instantOf(ev, 'DTEND')).toBe(utcStamp(zonedToUtc(today(), 11, 0, tz)));
  });

  it('edits title and end time of a timed event', async () => {
    const title = uniqueTitle('e');
    const renamed = `${title}r`;
    const tz = emulatorTimezone();
    await suite.nc.dav.putEvent(E2E_CAL, title, timed({
      uid: title, summary: title, start: zonedToUtc(today(), 10, 0, tz), end: zonedToUtc(today(), 11, 0, tz),
    }));
    runFlow(suite.nc, 'event/edit-timed', { UID: title, NEW_TITLE: renamed });
    const ev = veventsOf((await serverHas(renamed))!)[0];
    expect(prop(ev, 'UID')).toBe(title);
    expect(instantOf(ev, 'DTEND')).toBe(utcStamp(zonedToUtc(today(), 12, 0, tz)));
    expect(await suite.nc.dav.findEvent(title)).toBeNull();
  });

  it('flags an end before the start and resets it to one hour after', async () => {
    const title = uniqueTitle('i');
    runFlow(suite.nc, 'event/invalid-range', { TITLE: title });
    const tz = emulatorTimezone();
    const ev = veventsOf((await serverHas(title))!)[0];
    expect(instantOf(ev, 'DTSTART')).toBe(utcStamp(zonedToUtc(today(), 10, 0, tz)));
    expect(instantOf(ev, 'DTEND')).toBe(utcStamp(zonedToUtc(today(), 11, 0, tz)));
  });
});
