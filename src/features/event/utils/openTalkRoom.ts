import { Alert, Linking, Platform, type AlertButton } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import i18n from '@/utils/i18n';
import type { TalkOpenMode } from '@/types';

const TALK_ANDROID_PACKAGE = 'com.nextcloud.talk2';

export function buildTalkIntentUrl(talkUrl: string): string {
  const withoutScheme = talkUrl.replace(/^https?:\/\//, '');
  const fallback = encodeURIComponent(talkUrl);
  return `intent://${withoutScheme}#Intent;scheme=https;package=${TALK_ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`;
}

/**
 * Builds the iOS custom URL scheme used by the Nextcloud Talk app.
 *
 * The talk URL is expected to be `https://server.example.com/call/<token>`
 * (or `http://...`). The returned URL looks like:
 *
 *   nextcloudtalk://open-conversation?server=<encodedBaseUrl>&withRoomToken=<token>
 */
export function buildTalkIOSUrl(talkUrl: string): string {
  const match = talkUrl.match(/^(https?):\/\/([^/?#]+)(\/[^?#]*)?/);
  if (!match) {
    return talkUrl;
  }

  const [, scheme, hostPort, rawPath = ''] = match;
  const server = `${scheme}://${hostPort}`;
  const token = rawPath.split('/').filter(Boolean).pop() || '';

  const encodedServer = encodeURIComponent(server);
  const encodedToken = encodeURIComponent(token);

  return `nextcloudtalk://open-conversation?server=${encodedServer}&withRoomToken=${encodedToken}`;
}

export function getTalkLinkingUrl(talkUrl: string): string {
  if (Platform.OS === 'android') {
    return buildTalkIntentUrl(talkUrl);
  }
  // On iOS we use the Nextcloud Talk custom URL scheme. canOpenURL will tell
  // us whether the Talk app is installed and can handle it.
  return buildTalkIOSUrl(talkUrl);
}

export async function canOpenTalkApp(talkUrl: string): Promise<boolean> {
  const url = getTalkLinkingUrl(talkUrl);
  return Linking.canOpenURL(url).catch(() => false);
}

export async function openInBrowser(talkUrl: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(talkUrl);
  } catch {
    await Linking.openURL(talkUrl);
  }
}

export async function openInTalkApp(talkUrl: string): Promise<void> {
  const linkingUrl = getTalkLinkingUrl(talkUrl);
  const canOpen = await canOpenTalkApp(talkUrl);

  if (!canOpen) {
    if (Platform.OS === 'ios') {
      // If the custom scheme cannot be handled, try the original HTTPS URL so
      // iOS can still route it through Universal Links.
      try {
        await Linking.openURL(talkUrl);
        return;
      } catch {
        // Fall through to the in-app browser fallback.
      }
    }
    await openInBrowser(talkUrl);
    return;
  }

  try {
    await Linking.openURL(linkingUrl);
  } catch {
    // If the system could not handle the linking URL, fall back to the
    // original HTTPS URL on iOS (for Universal Links) or the browser.
    if (Platform.OS === 'ios') {
      try {
        await Linking.openURL(talkUrl);
        return;
      } catch {
        // Fall through to the in-app browser fallback.
      }
    }
    await openInBrowser(talkUrl);
  }
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
