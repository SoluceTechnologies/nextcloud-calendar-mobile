import * as SecureStore from 'expo-secure-store';

import { saveAccount, loadAccounts } from '@/services/nextcloud/auth';
import { storage } from '@/storage';
import type { Account } from '@/types';

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 0,
  setItemAsync: jest.fn(async () => undefined),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('@/services/nextcloud/nextcloud', () => ({ fetchUserInfo: jest.fn() }));

const setItem = SecureStore.setItemAsync as jest.MockedFunction<typeof SecureStore.setItemAsync>;
const getItem = SecureStore.getItemAsync as jest.MockedFunction<typeof SecureStore.getItemAsync>;
const deleteItem = SecureStore.deleteItemAsync as jest.MockedFunction<typeof SecureStore.deleteItemAsync>;

const account = {
  id: 'acc1', baseUrl: 'https://cloud.example.com', username: 'u', appPassword: 'p',
} as Account;

const AFTER_FIRST_UNLOCK = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

function seedStoredAccount() {
  storage.set('account_ids', JSON.stringify([account.id]));
  getItem.mockResolvedValue(JSON.stringify(account));
}

describe('account keychain accessibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.clearAll();
  });

  it('stores accounts as AFTER_FIRST_UNLOCK so background boots can read them', async () => {
    await saveAccount(account);

    expect(setItem).toHaveBeenCalledWith('account_acc1', JSON.stringify(account), AFTER_FIRST_UNLOCK);
  });

  it('rewrites pre-existing entries once, deleting first so the accessibility actually changes', async () => {
    seedStoredAccount();

    await loadAccounts();

    // SecItemUpdate would keep WHEN_UNLOCKED, so the entry has to be removed first.
    expect(deleteItem).toHaveBeenCalledWith('account_acc1');
    expect(setItem).toHaveBeenCalledWith('account_acc1', JSON.stringify(account), AFTER_FIRST_UNLOCK);
    expect(deleteItem.mock.invocationCallOrder[0]).toBeLessThan(setItem.mock.invocationCallOrder[0]);
  });

  it('does not rewrite again on later reads', async () => {
    seedStoredAccount();

    await loadAccounts();
    jest.clearAllMocks();
    getItem.mockResolvedValue(JSON.stringify(account));
    await loadAccounts();

    expect(deleteItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('restores the entry and retries later when the rewrite fails', async () => {
    seedStoredAccount();
    setItem.mockRejectedValueOnce(new Error('User interaction is not allowed.'));

    const accounts = await loadAccounts();

    expect(accounts).toEqual([account]);
    // Second call is the restore, without the new options.
    expect(setItem).toHaveBeenNthCalledWith(2, 'account_acc1', JSON.stringify(account));
    expect(storage.getBoolean('account_keychain_after_first_unlock')).toBeFalsy();

    jest.clearAllMocks();
    getItem.mockResolvedValue(JSON.stringify(account));
    await loadAccounts();
    expect(setItem).toHaveBeenCalledWith('account_acc1', JSON.stringify(account), AFTER_FIRST_UNLOCK);
  });

  it('skips the migration when there is nothing stored', async () => {
    await loadAccounts();

    expect(deleteItem).not.toHaveBeenCalled();
    expect(storage.getBoolean('account_keychain_after_first_unlock')).toBeFalsy();
  });
});
