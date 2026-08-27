import { Alert, Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import i18n from '@/utils/i18n';
import type { TalkOpenMode } from '@/types';

const TALK_ANDROID_PACKAGE = 'com.nextcloud.talk2';

export function buildTalkIntentUrl(talkUrl: string): string {
  const withoutScheme = talkUrl.replace(/^https?:\/\//, '');
  const fallback = encodeURIComponent(talkUrl);
  return `intent://${withoutScheme}#Intent;scheme=https;package=${TALK_ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`;
}

export async function openInBrowser(talkUrl: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(talkUrl);
  } catch {
    await Linking.openURL(talkUrl);
  }
}

export async function openInTalkApp(talkUrl: string): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      await Linking.openURL(buildTalkIntentUrl(talkUrl));
      return;
    } catch {
      // Fall through to browser if Talk app is not installed.
    }
    await openInBrowser(talkUrl);
    return;
  }

  const canOpen = await Linking.canOpenURL(talkUrl).catch(() => false);
  if (canOpen) {
    await Linking.openURL(talkUrl);
  } else {
    await openInBrowser(talkUrl);
  }
}

export async function openTalkRoom(talkUrl: string, mode: TalkOpenMode): Promise<void> {
  if (mode === 'browser') {
    await openInBrowser(talkUrl);
    return;
  }

  if (mode === 'app') {
    await openInTalkApp(talkUrl);
    return;
  }

  Alert.alert(
    i18n.t('event.talkOpenTitle'),
    talkUrl,
    [
      { text: i18n.t('common.cancel'), style: 'cancel' },
      { text: i18n.t('event.openInTalk'), onPress: () => void openInTalkApp(talkUrl) },
      { text: i18n.t('event.openInBrowser'), onPress: () => void openInBrowser(talkUrl) },
    ],
    { cancelable: true }
  );
}

export async function promptTalkRoomOpen(talkUrl: string): Promise<void> {
  return openTalkRoom(talkUrl, 'ask');
}
