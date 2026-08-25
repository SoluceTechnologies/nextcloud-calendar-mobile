import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Dialog, Stack, Typography, Button, Divider } from '@/ui/components';
import type { CleartextNotConsentedError } from '@/services/shared/trustedFetch';

interface CleartextConsentSheetProps {
  error: CleartextNotConsentedError | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CleartextConsentSheet({ error, onConfirm, onCancel }: CleartextConsentSheetProps) {
  const { t } = useTranslation();

  return (
    <Dialog visible={error !== null} onClose={onCancel}>
      {error ? (
        <Stack gap={12} style={styles.content}>
          <Typography variant="h4">{t('cleartext.title')}</Typography>
          <Typography variant="caption" color="secondary">
            {t('cleartext.body', { host: error.host })}
          </Typography>

          <Divider />

          <Typography variant="caption" color="danger" weight="600">
            {t('cleartext.warning')}
          </Typography>
          <Typography variant="caption" color="secondary">
            {t('cleartext.remedy')}
          </Typography>

          <Stack gap={8} style={styles.actions}>
            <Button variant="secondary" title={t('cleartext.connect')} onPress={onConfirm} />
            <Button variant="primary" title={t('cleartext.cancel')} onPress={onCancel} />
          </Stack>
        </Stack>
      ) : null}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%' },
  actions: { width: '100%', marginTop: 4 },
});
