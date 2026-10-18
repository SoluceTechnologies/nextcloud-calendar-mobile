/** @type {import('jest').Config} */
export default {
  rootDir: '..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/e2e/**/*.e2e.ts'],
  globalSetup: '<rootDir>/e2e/globalSetup.ts',
  globalTeardown: '<rootDir>/e2e/globalTeardown.ts',
  testSequencer: '<rootDir>/e2e/sequencer.cjs',
  maxWorkers: 1,
  transformIgnorePatterns: ['/node_modules/'],
  testTimeout: 10 * 60 * 1000,
};
