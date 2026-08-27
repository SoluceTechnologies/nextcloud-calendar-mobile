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

describe('buildTalkIntentUrl', () => {
  it('builds an Android intent pointing at the Talk app', () => {
    const url = buildTalkIntentUrl('https://cloud.example.com/call/abc123');
    expect(url).toBe(
      'intent://cloud.example.com/call/abc123#Intent;scheme=https;package=com.nextcloud.talk2;S.browser_fallback_url=https%3A%2F%2Fcloud.example.com%2Fcall%2Fabc123;end'
    );
  });
});

describe('openInBrowser', () => {
  it('uses expo-web-browser and falls back to Linking', async () => {
    webBrowser.openBrowserAsync.mockRejectedValue(new Error('not supported'));
    await openInBrowser('https://cloud.example.com/call/abc123');
    expect(webBrowser.openBrowserAsync).toHaveBeenCalledWith('https://cloud.example.com/call/abc123');
    expect(Linking.openURL).toHaveBeenCalledWith('https://cloud.example.com/call/abc123');
  });

  it('does not fall back when expo-web-browser succeeds', async () => {
    await openInBrowser('https://cloud.example.com/call/abc123');
    expect(webBrowser.openBrowserAsync).toHaveBeenCalledWith('https://cloud.example.com/call/abc123');
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
});

describe('openInTalkApp', () => {
  it('opens the Talk intent on Android', async () => {
    setPlatform('android');
    await openInTalkApp('https://cloud.example.com/call/abc123');
    expect(Linking.openURL).toHaveBeenCalledWith(
      'intent://cloud.example.com/call/abc123#Intent;scheme=https;package=com.nextcloud.talk2;S.browser_fallback_url=https%3A%2F%2Fcloud.example.com%2Fcall%2Fabc123;end'
    );
    expect(webBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });

  it('falls back to browser when the Talk intent fails on Android', async () => {
    setPlatform('android');
    (Linking.openURL as jest.Mock).mockRejectedValue(new Error('no activity found'));
    await openInTalkApp('https://cloud.example.com/call/abc123');
    expect(Linking.openURL).toHaveBeenCalled();
    expect(webBrowser.openBrowserAsync).toHaveBeenCalledWith('https://cloud.example.com/call/abc123');
  });

  it('opens the URL directly on iOS when canOpenURL is true', async () => {
    setPlatform('ios');
    (Linking.canOpenURL as jest.Mock).mockResolvedValue(true);
    await openInTalkApp('https://cloud.example.com/call/abc123');
    expect(Linking.canOpenURL).toHaveBeenCalledWith('https://cloud.example.com/call/abc123');
    expect(Linking.openURL).toHaveBeenCalledWith('https://cloud.example.com/call/abc123');
    expect(webBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });

  it('falls back to browser on iOS when canOpenURL is false', async () => {
    setPlatform('ios');
    (Linking.canOpenURL as jest.Mock).mockResolvedValue(false);
    await openInTalkApp('https://cloud.example.com/call/abc123');
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(webBrowser.openBrowserAsync).toHaveBeenCalledWith('https://cloud.example.com/call/abc123');
  });
});

describe('openTalkRoom', () => {
  it('opens the browser in browser mode', async () => {
    await openTalkRoom('https://cloud.example.com/call/abc123', 'browser');
    expect(webBrowser.openBrowserAsync).toHaveBeenCalledWith('https://cloud.example.com/call/abc123');
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('opens the Talk app in app mode', async () => {
    setPlatform('android');
    await openTalkRoom('https://cloud.example.com/call/abc123', 'app');
    expect(Linking.openURL).toHaveBeenCalled();
    expect(webBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });

  it('shows an action sheet in ask mode', async () => {
    setPlatform('android');
    await openTalkRoom('https://cloud.example.com/call/abc123', 'ask');
    expect(Alert.alert).toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(webBrowser.openBrowserAsync).not.toHaveBeenCalled();

    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(buttons).toHaveLength(3);
    expect(buttons[0].text).toContain('Cancel');
    expect(buttons[1].text).toBe('Open in Talk app');
    expect(buttons[2].text).toBe('Open in browser');
  });
});
