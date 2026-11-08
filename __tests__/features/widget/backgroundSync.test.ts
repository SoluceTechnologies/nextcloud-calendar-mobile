const mockPushPins = jest.fn();
const mockGetActiveAccountId = jest.fn<Promise<string | null>, []>();
const mockLoadAccounts = jest.fn<Promise<{ id: string }[]>, []>();
const mockSyncCalendars = jest.fn(async () => []);
const mockSyncVisibleRange = jest.fn(async () => {});
const mockSyncWidget = jest.fn(async () => {});
const mockScheduleEventAlerts = jest.fn(async () => {});

jest.mock('@/services/shared/certPins', () => ({
  pushPinsToNative: () => mockPushPins(),
}));

jest.mock('@/services/nextcloud/auth', () => ({
  getActiveAccountId: () => mockGetActiveAccountId(),
  loadAccounts: () => mockLoadAccounts(),
}));

jest.mock('@/database/sync', () => ({
  syncCalendars: (...args: unknown[]) => mockSyncCalendars(...args),
  syncVisibleRange: (...args: unknown[]) => mockSyncVisibleRange(...args),
}));

jest.mock('@/features/notifications/scheduleAlerts', () => ({
  scheduleEventAlerts: (...args: unknown[]) => mockScheduleEventAlerts(...args),
}));

jest.mock('@/features/widget/sync/syncWidget', () => ({
  syncWidget: (...args: unknown[]) => mockSyncWidget(...args),
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(async () => false),
}));

jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 2 },
  getStatusAsync: jest.fn(async () => 1),
  registerTaskAsync: jest.fn(async () => {}),
  unregisterTaskAsync: jest.fn(async () => {}),
}));

import { runBackgroundWidgetSync } from '@/features/widget/sync/backgroundSync';

describe('runBackgroundWidgetSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActiveAccountId.mockResolvedValue('acc-1');
    mockLoadAccounts.mockResolvedValue([{ id: 'acc-1' }]);
  });

  it('pushes stored cert pins to the native TLS module before fetching', async () => {
    await runBackgroundWidgetSync();
    expect(mockPushPins).toHaveBeenCalledTimes(1);
  });

  it('still pushes pins when no account is configured', async () => {
    mockGetActiveAccountId.mockResolvedValue(null);
    await runBackgroundWidgetSync();
    expect(mockPushPins).toHaveBeenCalledTimes(1);
    expect(mockSyncCalendars).not.toHaveBeenCalled();
  });

  it('runs the visible-range sync and widget refresh when account exists', async () => {
    await runBackgroundWidgetSync();
    expect(mockSyncCalendars).toHaveBeenCalledTimes(1);
    expect(mockSyncWidget).toHaveBeenCalledTimes(1);
    expect(mockScheduleEventAlerts).toHaveBeenCalledTimes(1);
  });
});
