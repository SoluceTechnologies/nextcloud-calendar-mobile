import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Share, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
// Not re-exported by the package index in v15.
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { useActiveAccount } from '@/hooks/useAccounts';
import { useAccountStore } from '@/stores/accountStore';
import {
  officeUserAgent,
  openDirectEditingUrl,
  usesOfficeUserAgent,
} from '@/services/nextcloud/directEditing';
import { createPublicLinkShare } from '@/services/nextcloud/shares';
import { utf8ToBase64 } from '@/services/shared/base64';
import { downloadAndShare } from '@/features/event/utils/attachments';
import { takePendingEditorUrl } from '@/features/event/utils/editorSession';
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
  [
    'loading', 'loaded', 'documentLoaded', 'close', 'reload',
    'hyperlink', 'share', 'downloadAs',
  ].forEach(function(n) { iface[n] = function(v) { post(n, v); }; });
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

  // A pre-minted create URL comes through the session slot (not params) so a
  // restored screen falls back to `requestUrl` instead of a dead token.
  const [url, setUrl] = useState<string | null>(() => takePendingEditorUrl());
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [failed, setFailed] = useState(false);

  // The one-time URL is consumed by the first load, so `reload` (session
  // invalidation) must request a fresh URL rather than call webView.reload().
  const requestUrl = useCallback(async () => {
    // `account` may briefly be null while the store hydrates — only a missing
    // path is a dead end (with no pending URL, nothing can ever load).
    if (!path) {
      setFailed(true);
      return;
    }
    if (!account) return;
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
    if (!url && !failed) void requestUrl();
  }, [url, failed, requestUrl]);

  useEffect(() => {
    if (!url || loaded) return;
    const timer = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [url, loaded]);

  const close = useCallback(() => goBackOrHome(router), [router]);

  const shareFile = useCallback(async () => {
    if (!account || !path) return;
    try {
      // Upstream opens its share dialog; the closest equivalent here is a
      // fresh public link handed to the OS share sheet.
      const { url: publicUrl } = await createPublicLinkShare(account, path);
      await Share.share({ message: publicUrl });
    } catch (error) {
      console.warn('[editor] share failed', error);
      Alert.alert(t('event.editorActionError'));
    }
  }, [account, path, t]);

  const downloadAs = useCallback(
    async (values: Record<string, unknown> | undefined) => {
      if (!account) return;
      const target = values?.URL ?? values?.url;
      if (typeof target !== 'string') return;
      try {
        // Export endpoints live on the same host; Basic auth works there.
        const absolute = new URL(target, account.baseUrl).toString();
        const filename = typeof values?.filename === 'string' ? values.filename : undefined;
        const fmttype = typeof values?.Type === 'string' ? values.Type : undefined;
        await downloadAndShare(
          absolute,
          { uri: absolute, filename, fmttype },
          `Basic ${utf8ToBase64(`${account.username}:${account.appPassword}`)}`,
        );
      } catch (error) {
        console.warn('[editor] downloadAs failed', error);
        Alert.alert(t('event.editorActionError'));
      }
    },
    [account, t],
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let msg: { name?: string; values?: unknown };
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      // Android's bridge contract delivers payloads as JSON strings.
      let values: Record<string, unknown> | undefined;
      try {
        values =
          typeof msg.values === 'string'
            ? (JSON.parse(msg.values) as Record<string, unknown>)
            : (msg.values as Record<string, unknown> | undefined);
      } catch {
        values = undefined;
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
        case 'share':
          void shareFile();
          break;
        case 'downloadAs':
          void downloadAs(values);
          break;
        case 'hyperlink': {
          const target = values?.Url ?? values?.url;
          if (typeof target === 'string' && /^https?:/i.test(target)) {
            void Linking.openURL(target);
          }
          break;
        }
      }
    },
    [close, requestUrl, shareFile, downloadAs],
  );

  /**
   * Mirrors `ExternalSiteWebView.shouldOverrideUrlLoading`: the editor stays
   * in the WebView only for same-host navigations (the one-time URL redirect
   * chain, editor internals); anything else goes to the system browser.
   */
  const onShouldStartLoad = useCallback(
    (request: ShouldStartLoadRequest) => {
      const target = request.url;
      if (!/^https?:/i.test(target)) return false;
      if (!account) return true;
      const hostOf = (u: string) =>
        u.match(/^https?:\/\/([^/?#]+)/i)?.[1]?.toLowerCase() ?? '';
      if (hostOf(target) === hostOf(account.baseUrl)) return true;
      void Linking.openURL(target).catch(() => {});
      return false;
    },
    [account],
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
            onShouldStartLoadWithRequest={onShouldStartLoad}
            userAgent={
              usesOfficeUserAgent(editorId)
                ? officeUserAgent(Constants.expoConfig?.version ?? '0')
                : undefined
            }
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
