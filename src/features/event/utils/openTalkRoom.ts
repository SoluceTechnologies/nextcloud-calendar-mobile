import { Alert, Linking, Platform, type AlertButton } from 'react-native';
import i18n from '@/utils/i18n';
import { getAccounts } from '@/hooks/useAccounts';
import { useAccountStore } from '@/stores/accountStore';
import type { Account, TalkOpenMode } from '@/types';

const TALK_ANDROID_PACKAGE = 'com.nextcloud.talk2';

type TalkTarget = {
  server: string;
  token: string;
};

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}

function hostOf(url: string): string {
  return url.match(/^https?:\/\/([^/?#]+)/i)?.[1].toLowerCase() ?? '';
}

export function buildTalkIntentUrl(talkUrl: string): string {
  const withoutScheme = talkUrl.replace(/^https?:\/\//, '');
  const fallback = encodeURIComponent(talkUrl);
  return `intent://${withoutScheme}#Intent;scheme=https;package=${TALK_ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`;
}


export function parseTalkUrl(talkUrl: string): TalkTarget | null {
  const match = talkUrl.match(/^(https?:\/\/[^/?#]+)(\/[^?#]*)?/i);
  if (!match) {
    return null;
  }

  const [, origin, rawPath = ''] = match;
  const segments = rawPath.split('/').filter(Boolean);
  const callIndex = segments.lastIndexOf('call');
  const token = callIndex >= 0 ? segments[callIndex + 1] ?? '' : segments[segments.length - 1] ?? '';
  const prefix = (callIndex >= 0 ? segments.slice(0, callIndex) : []).filter((s) => s !== 'index.php');

  return {
    server: prefix.length ? `${origin}/${prefix.join('/')}` : origin,
    token,
  };
}


export function resolveTalkAccount(talkUrl: string): Account | null {
  const target = parseTalkUrl(talkUrl);
  if (!target) {
    return null;
  }

  const activeAccountId = useAccountStore.getState().activeAccountId;
  const candidates = [...getAccounts()].sort(
    (a, b) => Number(b.id === activeAccountId) - Number(a.id === activeAccountId)
  );

  const server = stripTrailingSlashes(target.server).toLowerCase();
  const exact = candidates.find((a) => stripTrailingSlashes(a.baseUrl).toLowerCase() === server);
  if (exact) {
    return exact;
  }

  const host = hostOf(target.server);
  return candidates.find((a) => hostOf(a.baseUrl) === host) ?? null;
}

export function buildTalkIOSUrl(talkUrl: string): string {
  const target = parseTalkUrl(talkUrl);
  if (!target) {
    return talkUrl;
  }

  const account = resolveTalkAccount(talkUrl);
  const server = stripTrailingSlashes(account?.baseUrl ?? target.server);

  const params = [`server=${encodeURIComponent(server)}`];
  if (account?.davUserId) {
    params.push(`user=${encodeURIComponent(account.davUserId)}`);
  }
  params.push(`withRoomToken=${encodeURIComponent(target.token)}`);

  return `nextcloudtalk://open-conversation?${params.join('&')}`;
}

export function getTalkLinkingUrl(talkUrl: string): string {
  if (Platform.OS === 'android') {
    return buildTalkIntentUrl(talkUrl);
  }
  return buildTalkIOSUrl(talkUrl);
}

export async function canOpenTalkApp(talkUrl: string): Promise<boolean> {
  const url = getTalkLinkingUrl(talkUrl);
  return Linking.canOpenURL(url).catch(() => false);
}

// Hands the URL to the system so it opens in the browser app, not in an in-app webview.
export async function openInBrowser(talkUrl: string): Promise<void> {
  try {
    await Linking.openURL(talkUrl);
  } catch {
    Alert.alert(i18n.t('event.talkOpenTitle'), i18n.t('common.errorGeneric'));
  }
}

export async function openInTalkApp(talkUrl: string): Promise<void> {
  const linkingUrl = getTalkLinkingUrl(talkUrl);
  const canOpen = await canOpenTalkApp(talkUrl);

  if (canOpen) {
    try {
      await Linking.openURL(linkingUrl);
      return;
    } catch {
      // Fall through to the browser.
    }
  }

  await openInBrowser(talkUrl);
}

export async function openTalkRoom(talkUrl: string, mode: TalkOpenMode): Promise<void> {
  if (mode === 'browser') {
    await openInBrowser(talkUrl);
    return;
  }

  if (mode === 'app') {
    const canOpen = await canOpenTalkApp(talkUrl);

    if (canOpen) {
      await openInTalkApp(talkUrl);
    } else {
      Alert.alert(
        i18n.t('event.talkOpenTitle'),
        i18n.t('event.talkAppNotInstalled'),
        [
          { text: i18n.t('common.cancel'), style: 'cancel' },
          { text: i18n.t('event.openInBrowser'), onPress: () => void openInBrowser(talkUrl) },
        ],
        { cancelable: true }
      );
    }
    return;
  }

  const canOpen = await canOpenTalkApp(talkUrl);
  const buttons: AlertButton[] = [
    { text: i18n.t('common.cancel'), style: 'cancel' },
  ];

  if (canOpen) {
    buttons.push({ text: i18n.t('event.openInTalk'), onPress: () => void openInTalkApp(talkUrl) });
  }

  buttons.push({ text: i18n.t('event.openInBrowser'), onPress: () => void openInBrowser(talkUrl) });

  Alert.alert(
    i18n.t('event.talkOpenTitle'),
    talkUrl,
    buttons,
    { cancelable: true }
  );
}

export async function promptTalkRoomOpen(talkUrl: string): Promise<void> {
  return openTalkRoom(talkUrl, 'ask');
}
