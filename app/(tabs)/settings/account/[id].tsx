import { Alert, Linking } from 'react-native';
import { useLocalSearchParams, useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CircleCheck, SquareArrowOutUpRight } from 'lucide-react-native';

import { setActiveAccountId, clearActiveAccountId } from '@/services/nextcloud/auth';
import { describeMutationError } from '@/services/shared/errors';
import { useAccounts } from '@/hooks/useAccounts';
import { useAccountStore } from '@/stores/accountStore';
import { AvatarImage } from '@/components/AvatarImage';
import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { AccountReconnectForm } from '@/features/account/components/AccountReconnectForm';
import { useDeleteAccount } from '@/features/account/hooks/useMutateAccount';
import { useAccountAuthStatus } from '@/features/account/hooks/useAccountAuthStatus';
import { hostnameOf } from '@/features/account/utils/account';
import { Button, Icon, Item, List, SectionHeader, Stack, Typography } from '@/ui/components';

const cardOuter = { marginHorizontal: 16, marginBottom: 12 };

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();

  const accounts = useAccounts();
  const account = accounts.find((a) => a.id === id);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const setStoreId = useAccountStore((s) => s.setActiveAccountId);
  const remove = useDeleteAccount();
  const authStatus = useAccountAuthStatus(account);

  if (!account) {
    return (
      <SettingsPage title={t('settings.account.title')}>
        <Stack padding={16}>
          <Typography variant="body2" color="secondary">
            {t('settings.account.notFound')}
          </Typography>
        </Stack>
      </SettingsPage>
    );
  }

  const isActive = account.id === activeAccountId;

  const handleSetActive = async () => {
    await setActiveAccountId(account.id);
    setStoreId(account.id);
  };

  const handleDelete = () => {
    Alert.alert(
      t('settings.removeTitle'),
      t('settings.removeMsg', { name: account.displayName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.remove'),
          style: 'destructive',
          onPress: async () => {
            try {
              const { nextActiveId } = await remove.mutateAsync(account.id);
              if (isActive) {
                if (nextActiveId) {
                  await setActiveAccountId(nextActiveId);
                  setStoreId(nextActiveId);
                } else {
                  await clearActiveAccountId();
                  setStoreId(null);
                  router.replace('/(auth)/setup');
                  return;
                }
              }
              router.back();
            } catch (error) {
              Alert.alert(t('settings.removeTitle'), describeMutationError(error));
            }
          },
        },
      ],
    );
  };

  return (
    <SettingsPage title={t('settings.account.title')}>
      <Stack card gap={12} padding={16} direction="horizontal" vAlign="center" hAlign="center" style={cardOuter}>
        <AvatarImage account={account} size={56} />
        <Stack gap={2} vAlign="center" style={{ flexShrink: 1 }}>
          <Typography variant="body1" nowrap>{account.displayName}</Typography>
          <Typography variant="caption" color="secondary" nowrap>
            {hostnameOf(account.baseUrl)}
          </Typography>
        </Stack>
        {isActive ? (
          <Icon size={22}><CircleCheck color={colors.primary} /></Icon>
        ) : null}
      </Stack>

      <Stack style={cardOuter} hAlign="stretch">
        <SectionHeader title={t('settings.account.server')} />
        <List>
          <Item
            title={t('settings.account.serverUrl')}
            description={account.baseUrl}
          />
          <Item
            title={t('settings.account.username')}
            description={account.username}
          />
        </List>
      </Stack>

      {authStatus === 'lost' ? (
        <AccountReconnectForm account={account} style={cardOuter} />
      ) : null}

      <Stack gap={8} padding={[16, 8]} hAlign="stretch">
        {isActive ? null : (
          <Button
            variant="secondary"
            title={t('settings.account.useThisAccount')}
            onPress={handleSetActive}
          />
        )}
        <Button
          variant="secondary"
          color="primary"
          title={t('settings.account.editOnNextcloud')}
          icon={<Icon size={18}><SquareArrowOutUpRight color={colors.primary} /></Icon>}
          onPress={() => Linking.openURL(`${account.baseUrl}/settings/user`)}
        />
        <Button
          testID="account-delete"
          variant="ghost"
          color="danger"
          title={t('settings.account.delete')}
          loading={remove.isPending}
          disabled={remove.isPending}
          onPress={handleDelete}
        />
      </Stack>
    </SettingsPage>
  );
}
