import { runFlow, setupSuite, today, uidOf, uniqueTitle } from './app';
import { allDay, weekly } from './ics';
import { ADMIN, E2E_CAL } from './nextcloud';

const suite = setupSuite();

describe('search', () => {
  it('finds an event by title and opens it', async () => {
    const title = uniqueTitle('s');
    const uid = uidOf(title);
    await suite.nc.dav.putEvent(E2E_CAL, uid, allDay({ uid, summary: title, day: today() }));
    runFlow(suite.nc, 'search/find-open', { TITLE: title, UID: uid });
  });

  it('a calendar filter hides another calendar', async () => {
    const prefix = uniqueTitle('k');
    const hereTitle = `${prefix} here`;
    const elsewhereTitle = `${prefix} elsewhere`;
    await suite.nc.dav.createCalendar('elsewhere', 'Elsewhere');
    await suite.nc.dav.putEvent(
      E2E_CAL, uidOf(hereTitle), allDay({ uid: uidOf(hereTitle), summary: hereTitle, day: today() }),
    );
    await suite.nc.dav.putEvent(
      'elsewhere', uidOf(elsewhereTitle), allDay({ uid: uidOf(elsewhereTitle), summary: elsewhereTitle, day: today() }),
    );
    runFlow(suite.nc, 'search/calendar-filter', {
      PREFIX: prefix,
      HERE_UID: uidOf(hereTitle),
      ELSEWHERE_UID: uidOf(elsewhereTitle),
      ELSEWHERE_TITLE: elsewhereTitle,
      CAL_NAME: 'Elsewhere',
    });
  });

  it('opens a series that ended three years ago from the server', async () => {
    const title = uniqueTitle('p');
    const uid = uidOf(title);
    const now = today();
    const day = new Date(now.getFullYear() - 3, now.getMonth(), 15);
    await suite.nc.dav.putEvent(E2E_CAL, uid, weekly({ uid, summary: title, day, count: 3 }));
    runFlow(suite.nc, 'search/server-hit', {
      TITLE: title,
      HREF_PATH: `/remote.php/dav/calendars/${ADMIN.user}/${E2E_CAL}/${uid}.ics`,
    });
  });
});
