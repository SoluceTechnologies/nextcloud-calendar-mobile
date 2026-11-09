import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useTaskTypes } from '@/features/ai/useTaskTypes';
import { fetchTaskTypes, hasTextTaskType } from '@/services/nextcloud/taskprocessing';
import { setAccounts } from '@/hooks/useAccounts';
import { useAccountStore } from '@/stores/accountStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Account, TaskTypeInfo } from '@/types';

jest.mock(
  '@/services/nextcloud/taskprocessing',
  () => ({
    fetchTaskTypes: jest.fn(),
    scheduleTask: jest.fn(),
    getTask: jest.fn(),
    cancelTask: jest.fn(),
    pollTask: jest.fn(),
    hasTextTaskType: jest.fn(),
  }),
  { virtual: true }
);

const fetchTypes = fetchTaskTypes as jest.Mock;
const pickText = hasTextTaskType as jest.Mock;

function account(id: string): Account {
  return {
    id,
    displayName: 'Test',
    baseUrl: 'https://cloud.example.com',
    username: 'u',
    appPassword: 'p',
    davUserId: 'u',
  };
}

const types: Record<string, TaskTypeInfo> = {
  'core:text2text': {
    name: 'Free text to text',
    description: '',
    inputShape: {},
    outputShape: {},
  },
};

function activate(a: Account, ai: boolean) {
  setAccounts([a]);
  useAccountStore.getState().setActiveAccountId(a.id);
  useSettingsStore.getState().setAiEnabled(ai);
}

beforeEach(() => {
  jest.clearAllMocks();
  setAccounts([]);
  useAccountStore.getState().setActiveAccountId(null);
  useSettingsStore.getState().setAiEnabled(false);
  fetchTypes.mockResolvedValue(types);
  pickText.mockImplementation((t) =>
    t && Object.keys(t).length > 0 ? 'core:text2text' : null
  );
});

describe('useTaskTypes', () => {
  it('stays lazy and does not fetch while aiEnabled is off', async () => {
    activate(account('off-1'), false);
    const { result } = renderHook(() => useTaskTypes());
    await act(async () => {});
    expect(fetchTypes).not.toHaveBeenCalled();
    expect(result.current.taskTypes).toBeNull();
    expect(result.current.textTaskType).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('does not fetch when ai is on but no account is active', async () => {
    setAccounts([account('ghost')]);
    useSettingsStore.getState().setAiEnabled(true);
    renderHook(() => useTaskTypes());
    await act(async () => {});
    expect(fetchTypes).not.toHaveBeenCalled();
  });

  it('fetches task types for the active account once ai is enabled', async () => {
    const a = account('on-1');
    activate(a, true);
    const { result } = renderHook(() => useTaskTypes());
    await waitFor(() => expect(result.current.taskTypes).toEqual(types));
    expect(fetchTypes).toHaveBeenCalledTimes(1);
    expect(fetchTypes).toHaveBeenCalledWith(a);
    expect(result.current.textTaskType).toBe('core:text2text');
    expect(result.current.loading).toBe(false);
  });

  it('serves cached types on remount without refetching', async () => {
    activate(account('cached-1'), true);
    const first = renderHook(() => useTaskTypes());
    await waitFor(() => expect(first.result.current.taskTypes).toEqual(types));
    first.unmount();

    const second = renderHook(() => useTaskTypes());
    expect(second.result.current.taskTypes).toEqual(types);
    expect(second.result.current.loading).toBe(false);
    await act(async () => {});
    expect(fetchTypes).toHaveBeenCalledTimes(1);
    second.unmount();
  });

  it('dedupes concurrent mounts into a single fetch', async () => {
    activate(account('dedup-1'), true);
    renderHook(() => ({ a: useTaskTypes(), b: useTaskTypes() }));
    await waitFor(() => expect(fetchTypes).toHaveBeenCalledTimes(1));
  });

  it('refresh busts the cache and refetches', async () => {
    activate(account('refresh-1'), true);
    const { result } = renderHook(() => useTaskTypes());
    await waitFor(() => expect(result.current.taskTypes).toEqual(types));
    act(() => result.current.refresh());
    await waitFor(() => expect(fetchTypes).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.taskTypes).toEqual(types));
  });

  it('does not cache failures so a later mount retries', async () => {
    activate(account('fail-1'), true);
    fetchTypes.mockRejectedValueOnce(new Error('boom'));
    const first = renderHook(() => useTaskTypes());
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.taskTypes).toBeNull();
    first.unmount();

    const second = renderHook(() => useTaskTypes());
    await waitFor(() => expect(second.result.current.taskTypes).toEqual(types));
    expect(fetchTypes).toHaveBeenCalledTimes(2);
    second.unmount();
  });

  it('refetches when the account credentials change (reconnect)', async () => {
    const a = account('recon-1');
    activate(a, true);
    const first = renderHook(() => useTaskTypes());
    await waitFor(() => expect(first.result.current.taskTypes).toEqual(types));
    expect(fetchTypes).toHaveBeenCalledTimes(1);
    first.unmount();

    // Reconnect keeps the account id but replaces the app password.
    const reconnected = { ...a, appPassword: 'new-app-password' };
    activate(reconnected, true);
    const second = renderHook(() => useTaskTypes());
    await waitFor(() => expect(fetchTypes).toHaveBeenCalledTimes(2));
    expect(fetchTypes).toHaveBeenLastCalledWith(reconnected);
    await waitFor(() => expect(second.result.current.taskTypes).toEqual(types));
    second.unmount();
  });
});
