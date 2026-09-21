import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
import { useActiveAccount } from '@/hooks/useAccounts';
import { useAccountStore } from '@/stores/accountStore';
import { openDirectEditingUrl } from '@/services/nextcloud/directEditing';
import { Button, ScreenHeader, Spinner, Typography, ViewContainer } from '@/ui/components';
import { goBackOrHome } from '@/utils/navigationGuard';

const LOAD_TIMEOUT_MS = 15 * 1000;

/**
 * Polyfill of the `DirectEditingMobileInterface` contract that editor pages
 * (Nextcloud Text, richdocuments…) feature-detect. Each declared method
 * forwards to the WebView message channel; undeclared messages are skipped
 * by the page, so only the messages we actually handle are exposed.
 */
const DIRECT_EDITING_BRIDGE = `(function() {
  var post = function(name, values) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ name: name, values: values }));
  };
  var iface = {};
  ['loading', 'loaded', 'documentLoaded', 'close', 'reload', 'hyperlink']
    .forEach(function(n) { iface[n] = function(v) { post(n, v); }; });
  window.DirectEditingMobileInterface = iface;
})();
true;`;

export default function AttachmentEditorScreen() {
  const { path, editorId, name } = useLocalSearchParams<{
    path?: string;
    editorId?: string;
    name?: string;
  }>();
  const router = useRouter();
  const theme = useTheme();
  const { t } = useTranslation();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const account = useActiveAccount(activeAccountId);

  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [failed, setFailed] = useState(false);

  // The one-time URL is consumed by the first load, so `reload` (session
  // invalidation) must request a fresh URL rather than call webView.reload().
  const requestUrl = useCallback(async () => {
    if (!account || !path) return;
    setFailed(false);
    setTimedOut(false);
    setLoaded(false);
    try {
      setUrl(await openDirectEditingUrl(account, path, editorId));
    } catch (error) {
      console.warn('[editor] open failed', error);
      setUrl(null);
      setFailed(true);
    }
  }, [account, path, editorId]);

  useEffect(() => {
    void requestUrl();
  }, [requestUrl]);

  useEffect(() => {
    if (!url || loaded) return;
    const timer = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [url, loaded]);

  const close = useCallback(() => goBackOrHome(router), [router]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let msg: { name?: string; values?: unknown };
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      switch (msg.name) {
        case 'loaded':
        case 'documentLoaded':
          setLoaded(true);
          break;
        case 'close':
          close();
          break;
        case 'reload':
          void requestUrl();
          break;
        case 'hyperlink': {
          const values =
            typeof msg.values === 'string'
              ? (JSON.parse(msg.values) as Record<string, unknown>)
              : (msg.values as Record<string, unknown> | undefined);
          const target = values?.Url ?? values?.url;
          if (typeof target === 'string' && /^https?:/i.test(target)) {
            void Linking.openURL(target);
          }
          break;
        }
      }
    },
    [close, requestUrl],
  );

  return (
    <ViewContainer>
      <ScreenHeader title={name ?? t('event.attachmentEdit')} onBack={close} />
      <View style={styles.body}>
        {url && (
          <WebView
            source={{ uri: url }}
            style={[styles.webview, { backgroundColor: theme.colors.background }]}
            injectedJavaScriptBeforeContentLoaded={DIRECT_EDITING_BRIDGE}
            onMessage={onMessage}
            javaScriptEnabled
            domStorageEnabled
          />
        )}
        {!loaded && !failed && (
          <View
            style={[styles.overlay, { backgroundColor: theme.colors.background }]}
          >
            <Spinner />
            {timedOut && (
              <Typography variant="body1" color="secondary" style={styles.hint}>
                {t('event.editorLoadSlow')}
              </Typography>
            )}
          </View>
        )}
        {failed && (
          <View
            style={[styles.overlay, { backgroundColor: theme.colors.background }]}
          >
            <Typography variant="body1" color="secondary" style={styles.hint}>
              {t('event.attachmentEditError')}
            </Typography>
            <View style={styles.actions}>
              <Button variant="secondary" onPress={close}>
                {t('common.close')}
              </Button>
              <Button onPress={() => void requestUrl()}>{t('common.retry')}</Button>
            </View>
          </View>
        )}
      </View>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  webview: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  hint: { textAlign: 'center', paddingHorizontal: 24 },
  actions: { flexDirection: 'row', gap: 12 },
});
