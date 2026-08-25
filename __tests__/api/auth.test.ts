import * as SecureStore from 'expo-secure-store';
import { saveAccount, loadAccounts, deleteAccount, getActiveAccountId, setActiveAccountId } from '../../src/services/nextcloud/auth';
import { storage } from '../../src/storage';
import type { Account } from '../../src/types';

jest.mock('expo-secure-store');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;

const account: Account = {
  id: 'acc-1',
  displayName: 'Work',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'xxxx-xxxx',
  davUserId: 'john',
};

beforeEach(() => {
  jest.clearAllMocks();
  storage.clearAll();
});

describe('saveAccount', () => {
  it('stores account in SecureStore and adds id to storage', async () => {
    mockSecureStore.setItemAsync.mockResolvedValue();
    await saveAccount(account);
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      'account_acc-1',
      JSON.stringify(account)
    );
    const ids = JSON.parse(storage.getString('account_ids') ?? '[]');
    expect(ids).toContain('acc-1');
  });

  it('does not duplicate id if account already exists', async () => {
    mockSecureStore.setItemAsync.mockResolvedValue();
    await saveAccount(account);
    await saveAccount(account);
    const ids = JSON.parse(storage.getString('account_ids') ?? '[]');
    expect(ids.filter((id: string) => id === 'acc-1')).toHaveLength(1);
  });
});

describe('loadAccounts', () => {
  it('returns all accounts from SecureStore', async () => {
    storage.set('account_ids', JSON.stringify(['acc-1']));
    mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(account));
    const accounts = await loadAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].id).toBe('acc-1');
  });

  it('returns empty array when no accounts saved', async () => {
    const accounts = await loadAccounts();
    expect(accounts).toEqual([]);
  });
});

describe('deleteAccount', () => {
  it('removes account from SecureStore and storage', async () => {
    mockSecureStore.deleteItemAsync.mockResolvedValue();
    storage.set('account_ids', JSON.stringify(['acc-1', 'acc-2']));
    await deleteAccount('acc-1');
    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('account_acc-1');
    const ids = JSON.parse(storage.getString('account_ids') ?? '[]');
    expect(ids).not.toContain('acc-1');
    expect(ids).toContain('acc-2');
  });
});

describe('deleteAccount pin revocation', () => {
  const other: Account = {
    id: 'acc-2',
    displayName: 'Home',
    baseUrl: 'https://cloud.example.com',
    username: 'jane',
    appPassword: 'yyyy-yyyy',
    davUserId: 'jane',
  };

  it('removes pins for the host when no account is left on it', async () => {
    mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(account));
    mockSecureStore.deleteItemAsync.mockResolvedValue();
    storage.set('account_ids', JSON.stringify(['acc-1']));
    storage.set('cert_pins', JSON.stringify({ 'cloud.example.com:443': ['AA:BB'] }));

    await deleteAccount('acc-1');

    expect(JSON.parse(storage.getString('cert_pins') ?? '{}')).toEqual({});
  });

  it('keeps pins while another account still uses the host', async () => {
    mockSecureStore.getItemAsync.mockImplementation(async (key) =>
      key === 'account_acc-1' ? JSON.stringify(account) : JSON.stringify(other)
    );
    mockSecureStore.deleteItemAsync.mockResolvedValue();
    storage.set('account_ids', JSON.stringify(['acc-1', 'acc-2']));
    storage.set('cert_pins', JSON.stringify({ 'cloud.example.com:443': ['AA:BB'] }));

    await deleteAccount('acc-1');

    expect(JSON.parse(storage.getString('cert_pins') ?? '{}')).toEqual({
      'cloud.example.com:443': ['AA:BB'],
    });
  });

  it('tolerates an unparseable stored baseUrl', async () => {
    mockSecureStore.getItemAsync.mockResolvedValue(
      JSON.stringify({ ...account, baseUrl: 'not a url' })
    );
    mockSecureStore.deleteItemAsync.mockResolvedValue();
    storage.set('account_ids', JSON.stringify(['acc-1']));

    await expect(deleteAccount('acc-1')).resolves.toBeUndefined();
  });
});

describe('activeAccountId', () => {
  it('gets and sets active account id', async () => {
    await setActiveAccountId('acc-1');
    const id = await getActiveAccountId();
    expect(id).toBe('acc-1');
  });

  it('returns null when nothing set', async () => {
    const id = await getActiveAccountId();
    expect(id).toBeNull();
  });
});
