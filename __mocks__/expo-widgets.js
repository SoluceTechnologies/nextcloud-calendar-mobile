const createWidget = () => ({
  updateSnapshot: jest.fn(),
  reload: jest.fn(),
});

const createLiveActivity = () => ({
  start: jest.fn(() => ({
    update: jest.fn().mockResolvedValue(undefined),
    end: jest.fn().mockResolvedValue(undefined),
    getPushToken: jest.fn().mockResolvedValue(null),
  })),
  getInstances: jest.fn(() => []),
});

const after = (date) => date;

module.exports = { createWidget, createLiveActivity, after };
