// CI emulators are slower and flakier than a local one: rerun a failed test once there. Local runs fail on the first error.
if (process.env.CI) jest.retryTimes(1, { logErrorsBeforeRetry: true });
