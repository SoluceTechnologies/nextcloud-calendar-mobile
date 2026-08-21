import { useState } from 'react';
import * as Crypto from 'expo-crypto';
import { StyleSheet, KeyboardAvoidingView, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { QrCode, Eye, EyeOff } from 'lucide-react-native';
import { useRouter, useTheme } from 'expo-router';
import { validateCredentials } from '@/services/nextcloud/caldav';
import { HttpError, describeMutationError } from '@/services/shared/errors';
import { refreshAccounts, useAccounts } from '@/hooks/useAccounts';
import { saveAccount, setActiveAccountId } from '@/services/nextcloud/auth';
import { fetchUserInfo, exchangeOneTimeToken } from '@/services/nextcloud/nextcloud';
import { useAccountStore } from '@/stores/accountStore';
import { QrLoginScanner } from '@/features/account/components/QrLoginScanner';
import type { NcLoginData } from '@/features/account/components/QrLoginScanner';
import { CertTrustSheet } from '@/features/account/components/CertTrustSheet';
import { useCertTrust } from '@/features/account/hooks/useCertTrust';
import type { Account } from '@/types';
import { useTranslation } from 'react-i18next';
import { LanguageSheet } from '@/components/LanguageSheet';
import {
  ViewContainer, Stack, Typography, Button, TextField, Divider, IconButton, ScreenHeader,
} from '@/ui/components';

export default function SetupScreen() {
  const router = useRouter();
  const theme = useTheme();
  const setStoreId = useAccountStore((s) => s.setActiveAccountId);
  const { t } = useTranslation();
  const canGoBack = useAccounts().length > 1 && router.canGoBack();

  const [baseUrl, setBaseUrl] = useState('');
  const [username, setUsername] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const certTrust = useCertTrust();
  const [lastParams, setLastParams] = useState<{
    baseUrl: string;
    username: string;
    appPassword: string;
  } | null>(null);

  async function connectWith(params: {
    baseUrl: string;
    username: string;
    appPassword: string;
  }) {
    setError(null);
    setLastParams(params);
    let normalizedUrl = params.baseUrl.trim().replace(/\/$/, '');
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
    setLoading(true);
    try {
      const connected = await certTrust.run(async () => {
        const { davUserId } = await validateCredentials({
          baseUrl: normalizedUrl,
          username: params.username,
          appPassword: params.appPassword,
        });
        const userInfo = await fetchUserInfo({
          baseUrl: normalizedUrl,
          username: params.username,
          appPassword: params.appPassword,
          davUserId,
        });
        return { davUserId, userInfo };
      });
      // Untrusted certificate: the trust sheet is now shown; wait for the user.
      if (!connected) return;

      const account: Account = {
        id: Crypto.randomUUID(),
        displayName: connected.userInfo.displayName || params.username,
        baseUrl: normalizedUrl,
        username: params.username,
        appPassword: params.appPassword,
        davUserId: connected.davUserId,
        timezone: connected.userInfo.timezone,
        email: connected.userInfo.email,
      };
      await saveAccount(account);
      await setActiveAccountId(account.id);
      setStoreId(account.id);
      await refreshAccounts();
      router.replace('/(tabs)/calendar');
    } catch (e: unknown) {
      console.error(e);
      const status = e instanceof HttpError ? e.status : undefined;
      setError(
        status === 401 ? t('setup.errors.invalidCreds')
        : status === 404 ? t('setup.errors.serverNotFound')
        : describeMutationError(e)
      );
    } finally {
      setLoading(false);
    }
  }

  function handleTrustCert() {
    certTrust.confirm();
    if (lastParams) connectWith(lastParams);
  }

  function handleAdd() {
    if (!baseUrl || !username || !appPassword) {
      setError(t('setup.errors.required'));
      return;
    }
    connectWith({ baseUrl, username, appPassword });
  }

  async function handleQrScanned(data: NcLoginData) {
    setShowScanner(false);
    setBaseUrl(data.server);
    setUsername(data.user);

    if (!data.oneTime) {
      setAppPassword(data.password);
      connectWith({ baseUrl: data.server, username: data.user, appPassword: data.password });
      return;
    }

    setError(null);
    setLoading(true);
    let appPassword: string;
    try {
      appPassword = await exchangeOneTimeToken({
        baseUrl: data.server,
        username: data.user,
        oneTimeToken: data.password,
      });
    } catch (e: unknown) {
      setLoading(false);
      const status = e instanceof HttpError ? e.status : undefined;
      setError(
        status === 401 || status === 403
          ? t('setup.errors.qrOneTimeExpired')
          : describeMutationError(e)
      );
      return;
    }
    setLoading(false);
    setAppPassword(appPassword);
    connectWith({ baseUrl: data.server, username: data.user, appPassword });
  }

  return (
    <ViewContainer centered>
      <SafeAreaView style={styles.flex}>
      <ScreenHeader
        onBack={canGoBack ? () => router.back() : undefined}
        right={<LanguageSheet variant="icon" />}
      />
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Stack gap={8}>
            <Typography variant="caption" color="primary" weight="700">{t('setup.brand')}</Typography>
            <Typography variant="h2">{t('setup.title')}</Typography>
          </Stack>

          <Stack gap={16} style={styles.section}>
            <Button
              variant="primary"
              title={t('setup.scanQr')}
              icon={<QrCode size={22} color="#fff" />}
              disabled={loading}
              onPress={() => setShowScanner(true)}
            />

            <Stack direction="horizontal" vAlign="center" hAlign="center" gap={10}>
              <Divider flex />
              <Typography variant="caption" color="secondary">{t('setup.orManual')}</Typography>
              <Divider flex />
            </Stack>

            <TextField
              label={t('setup.serverUrl')}
              placeholder={t('setup.placeholders.serverUrl')}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              value={baseUrl}
              onChangeText={setBaseUrl}
            />

            <TextField
              label={t('setup.username')}
              placeholder={t('setup.placeholders.username')}
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={setUsername}
            />

            <TextField
              label={t('setup.appPassword')}
              placeholder={t('setup.placeholders.appPassword')}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              value={appPassword}
              onChangeText={setAppPassword}
              right={
                <IconButton variant="plain" size={36} onPress={() => setShowPassword((v) => !v)}>
                  {showPassword
                    ? <EyeOff size={20} color={theme.colors.textTertiary} />
                    : <Eye size={20} color={theme.colors.textTertiary} />}
                </IconButton>
              }
            />

            {error ? <Typography variant="caption" color="danger">{error}</Typography> : null}

            <Button
              variant="primary"
              title={t('setup.connect')}
              loading={loading}
              disabled={loading}
              onPress={handleAdd}
            />

            <Typography variant="caption" color="secondary">{t('setup.hint')}</Typography>
          </Stack>
        </ScrollView>

        <Stack padding={[16, 8]}>
          <Typography variant="caption" color="secondary" align="center">{t('setup.footer')}</Typography>
        </Stack>
      </KeyboardAvoidingView>

      </SafeAreaView>

      <QrLoginScanner
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onScanned={handleQrScanned}
      />

      <CertTrustSheet
        error={certTrust.pending}
        onTrust={handleTrustCert}
        onCancel={certTrust.dismiss}
      />
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 24 },
  section: { marginTop: 28 },
});
