import { runFlow, setupSuite, today } from './app';

const suite = setupSuite();

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('calendar', () => {
  it('shows the seeded event in every view', () => {
    runFlow(suite.nc, 'calendar/views', { TODAY: isoDay(today()) });
  });

  it('survives ten fast swipes each way', () => {
    runFlow(suite.nc, 'calendar/swipe-stress');
  });

  it('comes back to today from far away', () => {
    runFlow(suite.nc, 'calendar/far-and-today');
  });
});
