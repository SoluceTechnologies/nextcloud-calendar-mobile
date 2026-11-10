import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { setActiveAccountId } from '@/services/nextcloud/auth';
import { useAccounts } from '@/hooks/useAccounts';
import { useAccountStore } from '@/stores/accountStore';
import { AccountCard } from '@/features/account/components/AccountCard';
import { isLastEnabledAccount, nextActiveAccountId } from '@/features/account/utils/account';
import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { Button, Stack } from '@/ui/components';
import type { Account } from '@/types';

export default function AccountSettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const disabledAccountIds = useAccountStore((s) => s.disabledAccountIds);
  const setStoreId = useAccountStore((s) => s.setActiveAccountId);
  const setAccountDisabled = useAccountStore((s) => s.setAccountDisabled);
  const accounts = useAccounts();

  async function handleSetActive(id: string) {
    await setActiveAccountId(id);
    setAccountDisabled(id, false);
    setStoreId(id);
  }

  function handleToggleVisible(account: Account, visible: boolean) {
    if (visible) {
      setAccountDisabled(account.id, false);
      return;
    }
    if (isLastEnabledAccount(account.id, accounts, disabledAccountIds)) {
      Alert.alert(t('settings.account.lastVisibleTitle'), t('settings.account.lastVisibleMsg'));
      return;
    }
    setAccountDisabled(account.id, true);
    if (account.id === activeAccountId) {
      const next = nextActiveAccountId(accounts, [...disabledAccountIds, account.id]);
      if (next) void handleSetActive(next);
    }
  }

  return (
    <SettingsPage title={t('settings.accounts')}>
      {accounts.map((account) => (
        <AccountCard
          key={account.id}
          account={account}
          isActive={account.id === activeAccountId}
          isVisible={!disabledAccountIds.includes(account.id)}
          visibleLocked={isLastEnabledAccount(account.id, accounts, disabledAccountIds)}
          onSetActive={() => handleSetActive(account.id)}
          onOpen={() => router.push(`/(tabs)/settings/account/${account.id}`)}
          onToggleVisible={(visible) => handleToggleVisible(account, visible)}
        />
      ))}
      <Stack padding={[16, 8]}>
        <Button
          testID="accounts-add"
          variant="ghost"
          dashed
          title={t('settings.addAccount')}
          onPress={() => router.push('/(auth)/setup')}
        />
      </Stack>
    </SettingsPage>
  );
}
