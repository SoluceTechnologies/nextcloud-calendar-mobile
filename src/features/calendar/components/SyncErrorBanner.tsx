import { Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import { Stack, Typography } from '@/ui/components';

export function SyncErrorBanner({ onRetry }: { onRetry: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Pressable onPress={onRetry} accessibilityRole="button">
      <Stack direction="horizontal" vAlign="center" hAlign="center" padding={[12, 4]} backgroundColor={colors.danger}>
        <Typography variant="caption" color="light" weight="600" nowrap style={{ fontSize: 12 }}>
          {t('calendar.syncError')}
        </Typography>
      </Stack>
    </Pressable>
  );
}
