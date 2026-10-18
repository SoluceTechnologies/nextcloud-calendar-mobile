import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import { useIsOnline } from '@/services/shared/network';
import { Stack, Typography } from '@/ui/components';

export function OfflineBanner() {
  const online = useIsOnline();
  const { colors } = useTheme();
  const { t } = useTranslation();
  if (online) return null;
  return (
    <Stack testID="calendar-offline-banner" direction="horizontal" vAlign="center" hAlign="center" padding={[12, 4]} backgroundColor={colors.warning}>
      <Typography variant="caption" color="light" weight="600" nowrap style={{ fontSize: 12 }}>
        {t('calendar.offlineBanner')}
      </Typography>
    </Stack>
  );
}
