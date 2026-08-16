import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import { Eye, EyeOff, QrCode } from 'lucide-react-native';

import { Button, IconButton, Stack, TextField, Typography } from '@/ui/components';
import { exchangeOneTimeToken } from '@/services/nextcloud/nextcloud';
import { describeMutationError, HttpError } from '@/services/shared/errors';
import { useReconnectAccount } from '../hooks/useMutateAccount';
import { useCertTrust } from '../hooks/useCertTrust';
import { AccountFieldError, type FieldErrors } from '../utils/account';
import { QrLoginScanner, type NcLoginData } from './QrLoginScanner';
import { CertTrustSheet } from './CertTrustSheet';
import type { Account } from '@/types';

interface Props {
  account: Account;
  style?: object;
}

export function AccountReconnectForm({ account, style }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const reconnect = useReconnectAccount(account);

  const [appPassword, setAppPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [exchanging, setExchanging] = useState(false);

  const certTrust = useCertTrust();
  const [lastReconnect, setLastReconnect] = useState<{ password: string; username?: string } | null>(null);

  async function submit(password: string, username?: string) {
    setErrors({});
    setFormError(null);
    setDone(false);
    setLastReconnect({ password, username });
    try {
      const ok = await certTrust.run(async () => {
        await reconnect.mutateAsync({ appPassword: password, username });
        return true;
      });
      // Untrusted certificate: the trust sheet is now shown; wait for the user.
      if (!ok) return;
      setAppPassword('');
      setDone(true);
    } catch (error) {
      if (error instanceof AccountFieldError) {
        setErrors(error.fields);
        if (error.fields.username) {
          setFormError(t(`settings.account.errors.${error.fields.username}`));
        }
      } else {
        setFormError(describeMutationError(error));
      }
    }
  }

  function handleTrustCert() {
    certTrust.confirm();
    if (lastReconnect) submit(lastReconnect.password, lastReconnect.username);
  }

  async function handleScanned(data: NcLoginData) {
    setShowScanner(false);
    if (!data.oneTime) {
      await submit(data.password, data.user);
      return;
    }

    setFormError(null);
    setExchanging(true);
    try {
      const password = await exchangeOneTimeToken({
        baseUrl: data.server,
        username: data.user,
        oneTimeToken: data.password,
      });
      setExchanging(false);
      await submit(password, data.user);
    } catch (error) {
      setExchanging(false);
      const status = error instanceof HttpError ? error.status : undefined;
      setFormError(
        status === 401 || status === 403
          ? t('setup.errors.qrOneTimeExpired')
          : describeMutationError(error),
      );
    }
  }

  const busy = reconnect.isPending || exchanging;

  return (
    <Stack card gap={12} padding={16} hAlign="stretch" style={style}>
      <Typography variant="body1">{t('settings.account.connection')}</Typography>
      <Typography variant="caption" color="danger">
        {t('settings.account.connectionLost')}
      </Typography>
      <Typography variant="caption" color="secondary">
        {t('settings.account.reconnectHint')}
      </Typography>

      <TextField
        label={t('settings.account.appPassword')}
        value={appPassword}
        onChangeText={(value) => { setAppPassword(value); setDone(false); }}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        error={errors.appPassword ? t(`settings.account.errors.${errors.appPassword}`) : undefined}
        right={
          <IconButton variant="plain" size={36} onPress={() => setShowPassword((v) => !v)}>
            {showPassword
              ? <EyeOff size={20} color={theme.colors.textTertiary} />
              : <Eye size={20} color={theme.colors.textTertiary} />}
          </IconButton>
        }
      />

      {formError ? <Typography variant="caption" color="danger">{formError}</Typography> : null}
      {done ? (
        <Typography variant="caption" color="primary">{t('settings.account.reconnected')}</Typography>
      ) : null}

      <Button
        variant="primary"
        title={t('settings.account.reconnect')}
        loading={busy}
        disabled={busy || !appPassword.trim()}
        onPress={() => submit(appPassword)}
      />

      <Button
        variant="ghost"
        title={t('settings.account.scanQr')}
        icon={<QrCode size={20} color={theme.colors.primary} />}
        disabled={busy}
        onPress={() => setShowScanner(true)}
      />

      <QrLoginScanner
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onScanned={handleScanned}
      />

      <CertTrustSheet
        error={certTrust.pending}
        onTrust={handleTrustCert}
        onCancel={certTrust.dismiss}
      />
    </Stack>
  );
}
