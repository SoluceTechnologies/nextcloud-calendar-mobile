import { runFlow, setupSuite } from './app';

const suite = setupSuite();

describe('settings', () => {
  it('keeps the chosen view after a relaunch', () => {
    runFlow(suite.nc, 'settings/view-mode');
  });

  it('keeps the dark theme after a relaunch', () => {
    runFlow(suite.nc, 'settings/theme-dark');
  });
});
