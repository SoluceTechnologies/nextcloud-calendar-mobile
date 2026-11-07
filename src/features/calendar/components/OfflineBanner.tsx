import { Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import { useIsOnline } from '@/services/shared/network';
import { usePendingCount, drainPending } from '@/services/pendingMutations';
import { Stack, Typography } from '@/ui/components';
import type { Account } from '@/types';

export function OfflineBanner({ account }: { account: Account | null }) {
  const online = useIsOnline();
  const pending = usePendingCount();
  const { colors } = useTheme();
  const { t } = useTranslation();

  if (online && pending === 0) return null;
  const retryable = online && pending > 0 && !!account;
  const banner = (
    <Stack testID="calendar-offline-banner" direction="horizontal" vAlign="center" hAlign="center" padding={[12, 4]} backgroundColor={colors.warning}>
      <Typography variant="caption" color="light" weight="600" nowrap style={{ fontSize: 12 }}>
        {!online ? t('calendar.offlineBanner') : ''}
        {!online && pending > 0 ? ' — ' : ''}
        {pending > 0 ? t('calendar.pendingSync', { count: pending }) : ''}
      </Typography>
    </Stack>
  );
  if (!retryable) return banner;
  return <Pressable onPress={() => void drainPending(account)}>{banner}</Pressable>;
}
