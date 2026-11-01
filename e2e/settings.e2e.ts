import { runFlow, setupSuite, today } from './app';

const suite = setupSuite();

function isoDay(day: Date): string {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

describe('settings', () => {
  it('keeps the chosen view after a relaunch', () => {
    runFlow(suite.nc, 'settings/view-mode');
  });

  it('switches the month view to compact and back to grid', () => {
    runFlow(suite.nc, 'settings/month-view-style', { TODAY: isoDay(today()) });
  });

  it('keeps the dark theme after a relaunch', () => {
    runFlow(suite.nc, 'settings/theme-dark');
  });
});
