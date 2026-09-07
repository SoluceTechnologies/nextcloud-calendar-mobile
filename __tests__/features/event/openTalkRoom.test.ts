import { Platform, Linking, Alert } from 'react-native';
import {
  buildTalkAndroidUrl,
  buildTalkIOSUrl,
  parseTalkUrl,
  resolveTalkAccount,
  openInBrowser,
  openInTalkApp,
  openTalkRoom,
} from '../../../src/features/event/utils/openTalkRoom';
import { getAccounts } from '../../../src/hooks/useAccounts';
import { useAccountStore } from '../../../src/stores/accountStore';
import type { Account } from '../../../src/types';

jest.mock('../../../src/hooks/useAccounts', () => ({
  getAccounts: jest.fn(() => []),
}));

const mockedGetAccounts = getAccounts as jest.MockedFunction<typeof getAccounts>;

function account(partial: Partial<Account>): Account {
  return {
    id: 'acc-1',
    displayName: 'Alice',
    baseUrl: 'https://cloud.example.com',
    username: 'alice',
    appPassword: 'pw',
    davUserId: 'alice',
    ...partial,
  };
}

function setAccounts(list: Account[], activeAccountId: string | null = null) {
  mockedGetAccounts.mockReturnValue(list);
  useAccountStore.setState({ activeAccountId });
}

beforeEach(() => {
  jest.clearAllMocks();
  setAccounts([]);
  jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function setPlatform(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

const TALK_URL = 'https://cloud.example.com/call/abc123';
const ANDROID_TALK_URL = 'nextcloudtalk://cloud.example.com/call/abc123';
const ANDROID_TALK_URL_WITH_USER = 'nextcloudtalk://alice@cloud.example.com/call/abc123';
const IOS_TALK_URL =
  'nextcloudtalk://open-conversation?server=https%3A%2F%2Fcloud.example.com&withRoomToken=abc123';
const IOS_TALK_URL_WITH_USER =
  'nextcloudtalk://open-conversation?server=https%3A%2F%2Fcloud.example.com&user=alice&withRoomToken=abc123';

describe('buildTalkAndroidUrl', () => {
  it('builds the nextcloudtalk custom scheme URL the Talk app registers', () => {
    expect(buildTalkAndroidUrl(TALK_URL)).toBe(ANDROID_TALK_URL);
  });

  it('puts the account login name in the authority', () => {
    setAccounts([account({})]);
    expect(buildTalkAndroidUrl(TALK_URL)).toBe(ANDROID_TALK_URL_WITH_USER);
  });

  it('percent-encodes a login name that contains an @', () => {
    setAccounts([account({ username: 'alice@mail.tld' })]);
    expect(buildTalkAndroidUrl(TALK_URL)).toBe(
      'nextcloudtalk://alice%40mail.tld@cloud.example.com/call/abc123'
    );
  });

  it('keeps the subdirectory base path and drops index.php', () => {
    expect(buildTalkAndroidUrl('https://host.tld/nextcloud/index.php/call/tok3n')).toBe(
      'nextcloudtalk://host.tld/nextcloud/call/tok3n'
    );
  });

  it('keeps a non-standard port', () => {
    expect(buildTalkAndroidUrl('http://talk.local:8080/call/room1')).toBe(
      'nextcloudtalk://talk.local:8080/call/room1'
    );
  });

  it('returns the original URL when it cannot be parsed', () => {
    expect(buildTalkAndroidUrl('not-a-url')).toBe('not-a-url');
  });
});

describe('parseTalkUrl', () => {
  it('splits a plain Talk URL into server and token', () => {
    expect(parseTalkUrl(TALK_URL)).toEqual({
      server: 'https://cloud.example.com',
      basePath: '',
      token: 'abc123',
    });
  });

  it('strips index.php from the server', () => {
    expect(parseTalkUrl('https://cloud.example.com/index.php/call/abc123')).toEqual({
      server: 'https://cloud.example.com',
      basePath: '',
      token: 'abc123',
    });
  });

  it('keeps a subdirectory install in the server', () => {
    expect(parseTalkUrl('https://host.tld/nextcloud/index.php/call/tok3n')).toEqual({
      server: 'https://host.tld/nextcloud',
      basePath: '/nextcloud',
      token: 'tok3n',
    });
  });

  it('ignores query and hash fragments', () => {
    expect(parseTalkUrl('https://cloud.example.com/call/abc123?from=mail#x')).toEqual({
      server: 'https://cloud.example.com',
      basePath: '',
      token: 'abc123',
    });
  });

  it('returns null for a non-URL', () => {
    expect(parseTalkUrl('not-a-url')).toBeNull();
  });
});

describe('resolveTalkAccount', () => {
  it('matches the account whose baseUrl equals the Talk server', () => {
    const acc = account({});
    setAccounts([account({ id: 'other', baseUrl: 'https://other.tld', davUserId: 'bob' }), acc]);
    expect(resolveTalkAccount(TALK_URL)?.davUserId).toBe('alice');
  });

  it('ignores a trailing slash on the account baseUrl', () => {
    setAccounts([account({ baseUrl: 'https://cloud.example.com/' })]);
    expect(resolveTalkAccount(TALK_URL)?.davUserId).toBe('alice');
  });

  it('prefers the active account when several accounts share the server', () => {
    setAccounts(
      [
        account({ id: 'a', davUserId: 'alice' }),
        account({ id: 'b', davUserId: 'bob' }),
      ],
      'b'
    );
    expect(resolveTalkAccount(TALK_URL)?.davUserId).toBe('bob');
  });

  it('falls back to a host match when the path prefix differs', () => {
    setAccounts([account({ baseUrl: 'https://cloud.example.com/nextcloud', davUserId: 'carol' })]);
    expect(resolveTalkAccount(TALK_URL)?.davUserId).toBe('carol');
  });

  it('returns null when no account matches the server', () => {
    setAccounts([account({ baseUrl: 'https://other.tld' })]);
    expect(resolveTalkAccount(TALK_URL)).toBeNull();
  });
});

describe('buildTalkIOSUrl', () => {
  it('builds a nextcloudtalk custom scheme URL from an HTTPS talk URL', () => {
    const url = buildTalkIOSUrl(TALK_URL);
    expect(url).toBe(IOS_TALK_URL);
  });

  it('adds the user query param so Talk can find the configured account', () => {
    setAccounts([account({})]);
    expect(buildTalkIOSUrl(TALK_URL)).toBe(IOS_TALK_URL_WITH_USER);
  });

  it('uses the account baseUrl as the server so it matches the Talk account record', () => {
    setAccounts([account({ baseUrl: 'https://cloud.example.com/nextcloud', davUserId: 'carol' })]);
    expect(buildTalkIOSUrl(TALK_URL)).toBe(
      'nextcloudtalk://open-conversation?server=https%3A%2F%2Fcloud.example.com%2Fnextcloud&user=carol&withRoomToken=abc123'
    );
  });

  it('preserves the http scheme and non-standard port', () => {
    const url = buildTalkIOSUrl('http://talk.local:8080/call/room-1');
    expect(url).toBe(
      'nextcloudtalk://open-conversation?server=http%3A%2F%2Ftalk.local%3A8080&withRoomToken=room-1'
    );
  });

  it('returns the original URL when it cannot be parsed', () => {
    const url = buildTalkIOSUrl('not-a-url');
    expect(url).toBe('not-a-url');
  });
});

describe('openInBrowser', () => {
  it('opens the external browser app through Linking', async () => {
    await openInBrowser(TALK_URL);
    expect(Linking.openURL).toHaveBeenCalledWith(TALK_URL);
  });

  it('alerts when no browser can handle the URL', async () => {
    (Linking.openURL as jest.Mock).mockRejectedValue(new Error('no handler'));
    await openInBrowser(TALK_URL);
    expect(Alert.alert).toHaveBeenCalled();
  });
});

describe('openInTalkApp', () => {
  it('opens the Talk custom scheme on Android', async () => {
    setPlatform('android');
    setAccounts([account({})]);
    await openInTalkApp(TALK_URL);
    expect(Linking.openURL).toHaveBeenCalledWith(ANDROID_TALK_URL_WITH_USER);
  });

  // Android package visibility hides Talk from resolveActivity, so canOpenURL lies:
  // the launch must be attempted anyway.
  it('still attempts the launch on Android when canOpenURL is false', async () => {
    setPlatform('android');
    (Linking.canOpenURL as jest.Mock).mockResolvedValue(false);
    await openInTalkApp(TALK_URL);
    expect(Linking.openURL).toHaveBeenCalledWith(ANDROID_TALK_URL);
  });

  it('falls back to the browser on Android when the Talk app is missing', async () => {
    setPlatform('android');
    (Linking.openURL as jest.Mock).mockRejectedValueOnce(new Error('no activity found'));
    await openInTalkApp(TALK_URL);
    expect(Linking.openURL).toHaveBeenNthCalledWith(1, ANDROID_TALK_URL);
    expect(Linking.openURL).toHaveBeenNthCalledWith(2, TALK_URL);
  });

  it('opens the deep link with the account user on iOS', async () => {
    setPlatform('ios');
    setAccounts([account({})]);
    await openInTalkApp(TALK_URL);
    expect(Linking.openURL).toHaveBeenCalledWith(IOS_TALK_URL_WITH_USER);
  });

  it('falls back to the HTTPS URL on iOS when the custom scheme cannot be opened', async () => {
    setPlatform('ios');
    (Linking.openURL as jest.Mock).mockRejectedValueOnce(new Error('could not open'));
    await openInTalkApp(TALK_URL);
    expect(Linking.openURL).toHaveBeenNthCalledWith(1, IOS_TALK_URL);
    expect(Linking.openURL).toHaveBeenNthCalledWith(2, TALK_URL);
  });
});

describe('openTalkRoom', () => {
  it('opens the external browser in browser mode', async () => {
    await openTalkRoom(TALK_URL, 'browser');
    expect(Linking.openURL).toHaveBeenCalledWith(TALK_URL);
  });

  it('opens the Talk app in app mode on Android', async () => {
    setPlatform('android');
    await openTalkRoom(TALK_URL, 'app');
    expect(Linking.openURL).toHaveBeenCalledWith(ANDROID_TALK_URL);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('opens the Talk app in app mode on iOS', async () => {
    setPlatform('ios');
    await openTalkRoom(TALK_URL, 'app');
    expect(Linking.openURL).toHaveBeenCalledWith(IOS_TALK_URL);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('alerts in app mode when the launch fails on Android', async () => {
    setPlatform('android');
    (Linking.openURL as jest.Mock).mockRejectedValue(new Error('no activity found'));
    await openTalkRoom(TALK_URL, 'app');
    expect(Alert.alert).toHaveBeenCalled();

    const [title, message, buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(title).toBe('Open Talk room');
    expect(message).toContain('Nextcloud Talk is not installed');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].text).toContain('Cancel');
    expect(buttons[1].text).toBe('Open in browser');
  });

  it('alerts in app mode when the launch fails on iOS', async () => {
    setPlatform('ios');
    (Linking.openURL as jest.Mock).mockRejectedValue(new Error('could not open'));
    await openTalkRoom(TALK_URL, 'app');
    expect(Alert.alert).toHaveBeenCalled();

    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(buttons).toHaveLength(2);
    expect(buttons[0].text).toContain('Cancel');
    expect(buttons[1].text).toBe('Open in browser');
  });

  // Android cannot answer "is Talk installed?" reliably, so the option is always offered
  // and the launch attempt decides.
  it('always offers the Talk option in ask mode on Android', async () => {
    setPlatform('android');
    (Linking.canOpenURL as jest.Mock).mockResolvedValue(false);
    await openTalkRoom(TALK_URL, 'ask');
    expect(Linking.openURL).not.toHaveBeenCalled();

    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(buttons).toHaveLength(3);
    expect(buttons[0].text).toContain('Cancel');
    expect(buttons[1].text).toBe('Open in Talk app');
    expect(buttons[2].text).toBe('Open in browser');
  });

  it('shows three options in ask mode on iOS when the custom scheme can be opened', async () => {
    setPlatform('ios');
    await openTalkRoom(TALK_URL, 'ask');
    expect(Linking.canOpenURL).toHaveBeenCalledWith(IOS_TALK_URL);
    expect(Linking.openURL).not.toHaveBeenCalled();

    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(buttons).toHaveLength(3);
    expect(buttons[0].text).toContain('Cancel');
    expect(buttons[1].text).toBe('Open in Talk app');
    expect(buttons[2].text).toBe('Open in browser');
  });

  it('shows only browser and cancel in ask mode on iOS when Talk is not installed', async () => {
    setPlatform('ios');
    (Linking.canOpenURL as jest.Mock).mockResolvedValue(false);
    await openTalkRoom(TALK_URL, 'ask');
    expect(Linking.canOpenURL).toHaveBeenCalledWith(IOS_TALK_URL);
    expect(Linking.openURL).not.toHaveBeenCalled();

    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(buttons).toHaveLength(2);
    expect(buttons[0].text).toContain('Cancel');
    expect(buttons[1].text).toBe('Open in browser');
  });
});
