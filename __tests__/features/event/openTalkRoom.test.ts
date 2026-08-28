import { Platform, Linking, Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import {
  buildTalkIntentUrl,
  openInBrowser,
  openInTalkApp,
  openTalkRoom,
} from '../../../src/features/event/utils/openTalkRoom';

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
}));

const webBrowser = WebBrowser as unknown as { openBrowserAsync: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  webBrowser.openBrowserAsync.mockResolvedValue({ type: 'opened' } as unknown as WebBrowser.WebBrowserResult);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function setPlatform(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

const TALK_URL = 'https://cloud.example.com/call/abc123';
const INTENT_URL =
  'intent://cloud.example.com/call/abc123#Intent;scheme=https;package=com.nextcloud.talk2;S.browser_fallback_url=https%3A%2F%2Fcloud.example.com%2Fcall%2Fabc123;end';

describe('buildTalkIntentUrl', () => {
  it('builds an Android intent pointing at the Talk app', () => {
    const url = buildTalkIntentUrl(TALK_URL);
    expect(url).toBe(INTENT_URL);
  });
});

describe('openInBrowser', () => {
  it('uses expo-web-browser and falls back to Linking', async () => {
    webBrowser.openBrowserAsync.mockRejectedValue(new Error('not supported'));
    await openInBrowser(TALK_URL);
    expect(webBrowser.openBrowserAsync).toHaveBeenCalledWith(TALK_URL);
    expect(Linking.openURL).toHaveBeenCalledWith(TALK_URL);
  });

  it('does not fall back when expo-web-browser succeeds', async () => {
    await openInBrowser(TALK_URL);
    expect(webBrowser.openBrowserAsync).toHaveBeenCalledWith(TALK_URL);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
});

describe('openInTalkApp', () => {
  it('checks canOpenURL with the intent URL and opens it on Android', async () => {
    setPlatform('android');
    await openInTalkApp(TALK_URL);
    expect(Linking.canOpenURL).toHaveBeenCalledWith(INTENT_URL);
    expect(Linking.openURL).toHaveBeenCalledWith(INTENT_URL);
    expect(webBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });

  it('falls back to the browser on Android when canOpenURL is false', async () => {
    setPlatform('android');
    (Linking.canOpenURL as jest.Mock).mockResolvedValue(false);
    await openInTalkApp(TALK_URL);
    expect(Linking.canOpenURL).toHaveBeenCalledWith(INTENT_URL);
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(webBrowser.openBrowserAsync).toHaveBeenCalledWith(TALK_URL);
  });

  it('falls back to browser when the Talk intent fails on Android', async () => {
    setPlatform('android');
    (Linking.openURL as jest.Mock).mockRejectedValue(new Error('no activity found'));
    await openInTalkApp(TALK_URL);
    expect(Linking.canOpenURL).toHaveBeenCalledWith(INTENT_URL);
    expect(Linking.openURL).toHaveBeenCalled();
    expect(webBrowser.openBrowserAsync).toHaveBeenCalledWith(TALK_URL);
  });

  it('opens the URL directly on iOS when canOpenURL is true', async () => {
    setPlatform('ios');
    (Linking.canOpenURL as jest.Mock).mockResolvedValue(true);
    await openInTalkApp(TALK_URL);
    expect(Linking.canOpenURL).toHaveBeenCalledWith(TALK_URL);
    expect(Linking.openURL).toHaveBeenCalledWith(TALK_URL);
    expect(webBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });

  it('falls back to browser on iOS when canOpenURL is false', async () => {
    setPlatform('ios');
    (Linking.canOpenURL as jest.Mock).mockResolvedValue(false);
    await openInTalkApp(TALK_URL);
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(webBrowser.openBrowserAsync).toHaveBeenCalledWith(TALK_URL);
  });
});

describe('openTalkRoom', () => {
  it('opens the browser in browser mode', async () => {
    await openTalkRoom(TALK_URL, 'browser');
    expect(webBrowser.openBrowserAsync).toHaveBeenCalledWith(TALK_URL);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('opens the Talk app in app mode when canOpenURL is true', async () => {
    setPlatform('android');
    await openTalkRoom(TALK_URL, 'app');
    expect(Linking.canOpenURL).toHaveBeenCalledWith(INTENT_URL);
    expect(Linking.openURL).toHaveBeenCalledWith(INTENT_URL);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(webBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });

  it('shows an alert in app mode when canOpenURL is false', async () => {
    setPlatform('android');
    (Linking.canOpenURL as jest.Mock).mockResolvedValue(false);
    await openTalkRoom(TALK_URL, 'app');
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(webBrowser.openBrowserAsync).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalled();

    const [title, message, buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(title).toBe('Open Talk room');
    expect(message).toContain('Nextcloud Talk is not installed');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].text).toContain('Cancel');
    expect(buttons[1].text).toBe('Open in browser');
  });

  it('shows three options in ask mode when the Talk app can be opened', async () => {
    setPlatform('android');
    await openTalkRoom(TALK_URL, 'ask');
    expect(Alert.alert).toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(webBrowser.openBrowserAsync).not.toHaveBeenCalled();

    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(buttons).toHaveLength(3);
    expect(buttons[0].text).toContain('Cancel');
    expect(buttons[1].text).toBe('Open in Talk app');
    expect(buttons[2].text).toBe('Open in browser');
  });

  it('shows only browser and cancel in ask mode when the Talk app cannot be opened', async () => {
    setPlatform('android');
    (Linking.canOpenURL as jest.Mock).mockResolvedValue(false);
    await openTalkRoom(TALK_URL, 'ask');
    expect(Alert.alert).toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(webBrowser.openBrowserAsync).not.toHaveBeenCalled();

    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(buttons).toHaveLength(2);
    expect(buttons[0].text).toContain('Cancel');
    expect(buttons[1].text).toBe('Open in browser');
  });
});