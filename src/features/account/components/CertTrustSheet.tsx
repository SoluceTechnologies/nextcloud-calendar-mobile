import { Platform, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Dialog, Stack, Typography, Button, Divider } from '@/ui/components';
import type { UntrustedCertError } from '@/services/shared/trustedFetch';

interface CertTrustSheetProps {
  error: UntrustedCertError | null;
  onTrust: () => void;
  onCancel: () => void;
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <Stack gap={2} style={styles.field}>
      <Typography variant="caption" color="secondary">{label}</Typography>
      <Typography variant="caption" weight="600" style={styles.mono} selectable>
        {value}
      </Typography>
    </Stack>
  );
}

export function CertTrustSheet({ error, onTrust, onCancel }: CertTrustSheetProps) {
  const { t } = useTranslation();

  return (
    <Dialog visible={error !== null} onClose={onCancel}>
      {error ? (
        <Stack gap={12} style={styles.content}>
          <Typography variant="h4">{t('certTrust.title')}</Typography>
          <Typography variant="caption" color="secondary">
            {t('certTrust.body', { host: error.host })}
          </Typography>

          <Divider />

          <Field label={t('certTrust.fingerprint')} value={error.sha256} />
          <Field label={t('certTrust.subject')} value={error.subject} />
          <Field label={t('certTrust.issuer')} value={error.issuer} />
          <Field label={t('certTrust.validFrom')} value={error.notBefore} />
          <Field label={t('certTrust.validTo')} value={error.notAfter} />

          <Typography variant="caption" color="danger" weight="600">
            {t('certTrust.warning')}
          </Typography>

          <Stack gap={8} style={styles.actions}>
            <Button variant="primary" title={t('certTrust.trust')} onPress={onTrust} />
            <Button variant="secondary" title={t('certTrust.cancel')} onPress={onCancel} />
          </Stack>
        </Stack>
      ) : null}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%' },
  field: { width: '100%' },
  actions: { width: '100%', marginTop: 4 },
  mono: {
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
  },
});
