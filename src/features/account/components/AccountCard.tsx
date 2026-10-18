import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import { CircleCheck, ChevronRight } from 'lucide-react-native';
import { AvatarImage } from '@/components/AvatarImage';
import { Stack, Typography, Icon, Button, AnimatedPressable } from '@/ui/components';
import { hostnameOf } from '../utils/account';
import type { Account } from '@/types';

interface Props {
  account: Account;
  isActive: boolean;
  onSetActive: () => void;
  onOpen: () => void;
}


export function AccountCard({ account, isActive, onSetActive, onOpen }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <Stack
      card
      direction="horizontal"
      hAlign="center"
      gap={10}
      padding={12}
      backgroundColor={isActive ? `${colors.primary}14` : undefined}
      borderColor={isActive ? colors.primary : undefined}
      borderWidth={isActive ? 1.5 : undefined}
      style={styles.card}
    >
      <AnimatedPressable onPress={onOpen} accessibilityRole="button" style={styles.identity}>
        <Stack direction="horizontal" hAlign="center" gap={12}>
          <AvatarImage account={account} size={44} />
          <Stack gap={2} flex>
            <Typography variant="body1" nowrap>{account.displayName}</Typography>
            <Typography variant="caption" color="secondary" nowrap>
              {hostnameOf(account.baseUrl)}
            </Typography>
          </Stack>
        </Stack>
      </AnimatedPressable>

      {isActive ? (
        <Stack direction="horizontal" hAlign="center" gap={4} inline>
          <Icon size={16}><CircleCheck color={colors.primary} /></Icon>
          <Typography variant="caption" color="primary" nowrap>
            {t('settings.accountActive')}
          </Typography>
        </Stack>
      ) : (
        <Button
          testID={`account-card-activate-${account.username}`}
          variant="link"
          size="small"
          inline
          title={t('settings.account.use')}
          onPress={onSetActive}
          style={styles.use}
        />
      )}

      <AnimatedPressable onPress={onOpen} accessibilityRole="button">
        <ChevronRight size={20} color={colors.textTertiary} />
      </AnimatedPressable>
    </Stack>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12 },
  identity: { flex: 1 },
  use: { paddingHorizontal: 6 },
});
