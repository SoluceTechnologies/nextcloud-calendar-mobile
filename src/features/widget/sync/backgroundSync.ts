import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { syncCalendars, syncVisibleRange } from '@/database/sync';
import { scheduleEventAlerts } from '@/features/notifications/scheduleAlerts';
import { getActiveAccountId, loadAccounts } from '@/services/nextcloud/auth';

import { syncWidget } from './syncWidget';

export const WIDGET_BACKGROUND_TASK = 'widget-agenda-refresh';

const MINIMUM_INTERVAL_MINUTES = 15;

const WINDOW_DAYS = 7;

export async function runBackgroundWidgetSync(now: Date = new Date()): Promise<void> {
  const accountId = await getActiveAccountId();
  if (!accountId) return;

  const account = (await loadAccounts()).find((a) => a.id === accountId);
  if (!account) return;

  const calendars = await syncCalendars(account);
  if (calendars.length > 0) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + WINDOW_DAYS);
    await syncVisibleRange(account, calendars, start, end, false);
  }

  await syncWidget(now);
  await scheduleEventAlerts(now);
}

TaskManager.defineTask(WIDGET_BACKGROUND_TASK, async () => {
  try {
    await runBackgroundWidgetSync();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    if (__DEV__) console.warn('[widget] background sync failed', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerWidgetBackgroundSync(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return;
    if (await TaskManager.isTaskRegisteredAsync(WIDGET_BACKGROUND_TASK)) return;
    await BackgroundTask.registerTaskAsync(WIDGET_BACKGROUND_TASK, {
      minimumInterval: MINIMUM_INTERVAL_MINUTES,
    });
  } catch (error) {
    if (__DEV__) console.warn('[widget] background sync registration failed', error);
  }
}

export async function unregisterWidgetBackgroundSync(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(WIDGET_BACKGROUND_TASK)) {
      await BackgroundTask.unregisterTaskAsync(WIDGET_BACKGROUND_TASK);
    }
  } catch {
  }
}
