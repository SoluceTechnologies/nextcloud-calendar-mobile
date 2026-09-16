import { renderHook, act } from '@testing-library/react-native';

import { useDeleteAccount } from '@/features/account/hooks/useMutateAccount';
import { ClearDatabaseForAccount } from '@/database/DatabaseProvider';
import { deleteAccount } from '@/services/nextcloud/auth';
import { refreshAccounts } from '@/hooks/useAccounts';
import { setCachedContacts, getCachedContacts } from '@/services/nextcloud/contactCache';
import { storage } from '@/storage';

jest.mock('@/database/DatabaseProvider', () => ({ ClearDatabaseForAccount: jest.fn() }));
jest.mock('@/services/nextcloud/auth', () => ({ deleteAccount: jest.fn(), saveAccount: jest.fn() }));
jest.mock('@/services/nextcloud/caldav', () => ({ validateCredentials: jest.fn() }));
jest.mock('@/hooks/useAccounts', () => ({ refreshAccounts: jest.fn(async () => []) }));

const clearDb = ClearDatabaseForAccount as jest.MockedFunction<typeof ClearDatabaseForAccount>;
const dropCredentials = deleteAccount as jest.MockedFunction<typeof deleteAccount>;

describe('useDeleteAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.clearAll();
    (refreshAccounts as jest.Mock).mockResolvedValue([]);
  });

  it('purges local data, then drops credentials and per-account caches', async () => {
    const order: string[] = [];
    clearDb.mockImplementation(async () => { order.push('db'); });
    dropCredentials.mockImplementation(async () => { order.push('credentials'); });

    setCachedContacts('acc1', [{ displayName: 'A', email: 'a@b.c' } as never]);
    storage.set('avatar:acc1', 'file://a.png');

    const { result } = renderHook(() => useDeleteAccount());
    await act(async () => { await result.current.mutateAsync('acc1'); });

    expect(order).toEqual(['db', 'credentials']);
    expect(clearDb).toHaveBeenCalledWith('acc1');
    expect(getCachedContacts('acc1')).toBeNull();
    expect(storage.getString('avatar:acc1')).toBeUndefined();
  });

  it('keeps the account when the purge fails, so the rows stay reachable for a retry', async () => {
    clearDb.mockRejectedValue(new Error('timed out'));
    setCachedContacts('acc1', [{ displayName: 'A', email: 'a@b.c' } as never]);

    const { result } = renderHook(() => useDeleteAccount());
    await act(async () => {
      await expect(result.current.mutateAsync('acc1')).rejects.toThrow('timed out');
    });

    expect(dropCredentials).not.toHaveBeenCalled();
    expect(getCachedContacts('acc1')).not.toBeNull();
  });
});
