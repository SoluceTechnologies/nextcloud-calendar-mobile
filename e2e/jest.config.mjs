/** @type {import('jest').Config} */
export default {
  rootDir: '..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/e2e/**/*.e2e.ts'],
  maxWorkers: 1,
  transformIgnorePatterns: ['/node_modules/'],
  testTimeout: 10 * 60 * 1000,
};
