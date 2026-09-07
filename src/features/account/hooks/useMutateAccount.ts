import {useCallback} from 'react';

import {saveAccount, deleteAccount} from '@/services/nextcloud/auth';
import {validateCredentials} from '@/services/nextcloud/caldav';
import {clearCachedContacts} from '@/services/nextcloud/contactCache';
import {refreshAccounts} from '@/hooks/useAccounts';
import {useAsyncAction} from '@/hooks/useAsyncAction';
import {ClearDatabaseForAccount} from '@/database/DatabaseProvider';
import {storage} from '@/storage';
import {
    AccountFieldError, diffProfile, validateProfilePatch,
    type AccountProfilePatch,
} from '../utils/account';
import type {Account} from '@/types';


export function useUpdateAccount(account: Account) {
    return useAsyncAction<AccountProfilePatch, Account>(
        useCallback(async (patch: AccountProfilePatch) => {
            const changes = diffProfile(account, patch);
            if (Object.keys(changes).length === 0) return account;

            const errors = validateProfilePatch(changes);
            if (errors) throw new AccountFieldError(errors);

            const next: Account = {...account, ...changes};
            await saveAccount(next);
            await refreshAccounts();
            return next;
        }, [account]),
    );
}

export function useReconnectAccount(account: Account) {
    return useAsyncAction<{ appPassword: string; username?: string }, Account>(
        useCallback(async ({appPassword, username}) => {
            const password = appPassword.trim();
            if (!password) throw new AccountFieldError({appPassword: 'required'});

            if (username !== undefined && username.trim() !== account.username) {
                throw new AccountFieldError({username: 'accountMismatch'});
            }

            const {davUserId} = await validateCredentials({
                baseUrl: account.baseUrl,
                username: account.username,
                appPassword: password,
            });

            const next: Account = {
                ...account,
                appPassword: password,
                davUserId: davUserId || account.davUserId,
            };
            await saveAccount(next);
            await refreshAccounts();
            return next;
        }, [account]),
    );
}

export function useDeleteAccount() {
    return useAsyncAction<string, { nextActiveId: string | null }>(
        useCallback(async (id: string) => {
            await ClearDatabaseForAccount(id);
            await deleteAccount(id);
            clearCachedContacts(id);
            storage.remove(`avatar:${id}`);
            const remaining = await refreshAccounts();
            return {nextActiveId: remaining.find((a) => a.id !== id)?.id ?? null};
        }, []),
    );
}
