import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from 'expo-router';
import AttachmentEditorScreen from '../../app/event/editor';
import { openDirectEditingUrl } from '../../src/services/nextcloud/directEditing';
import { lightTheme } from '../../src/theme';
import type { Account } from '../../src/types';
import i18n from '../../src/utils/i18n';

const account: Account = {
  id: 'acc-1',
  displayName: 'Alice',
  baseUrl: 'https://cloud.example.com',
  username: 'alice',
  appPassword: 'pw',
  davUserId: 'alice',
} as Account;

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  canGoBack: jest.fn(() => true),
};

let mockParams: Record<string, string | undefined> = {};

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter,
  useNavigation: () => ({
    getState: () => ({
      type: 'stack',
      routes: [{ name: 'index' }, { name: 'event/[uid]' }, { name: 'event/editor' }],
    }),
    reset: jest.fn(),
  }),
}));

jest.mock('../../src/hooks/useAccounts', () => ({
  useActiveAccount: () => account,
}));

jest.mock('../../src/services/nextcloud/directEditing', () => ({
  ...jest.requireActual('../../src/services/nextcloud/directEditing'),
  openDirectEditingUrl: jest.fn(),
}));

jest.mock('../../src/services/nextcloud/shares', () => ({
  createPublicLinkShare: jest.fn(),
}));

jest.mock('../../src/features/event/utils/attachments', () => ({
  downloadAndShare: jest.fn(),
}));

let webviewProps: Record<string, unknown> = {};
jest.mock('react-native-webview', () => {
  const ReactNative = require('react');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => {
      webviewProps = props;
      return ReactNative.createElement('WebView', props);
    },
  };
});

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ThemeProvider, { value: lightTheme, children });
}

function sendMessage(name: string, values?: unknown) {
  (webviewProps.onMessage as (e: unknown) => void)({
    nativeEvent: { data: JSON.stringify({ name, values }) },
  });
}

describe('AttachmentEditorScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    webviewProps = {};
    mockParams = {
      path: '/Calendar/note.txt',
      editorId: 'text',
      name: 'note.txt',
    };
    await i18n.changeLanguage('en');
    (openDirectEditingUrl as jest.Mock).mockResolvedValue(
      'https://cloud.example.com/apps/files/directEditing/tok1',
    );
  });

  it('requests a one-time URL and loads it in the WebView', async () => {
    render(<AttachmentEditorScreen />, { wrapper });
    await waitFor(() =>
      expect(webviewProps.source).toEqual({
        uri: 'https://cloud.example.com/apps/files/directEditing/tok1',
      }),
    );
    expect(openDirectEditingUrl).toHaveBeenCalledWith(
      account,
      '/Calendar/note.txt',
      'text',
    );
    expect(webviewProps.injectedJavaScriptBeforeContentLoaded).toContain(
      'DirectEditingMobileInterface',
    );
  });

  it('closes when the editor page emits close', async () => {
    render(<AttachmentEditorScreen />, { wrapper });
    await waitFor(() => expect(webviewProps.source).toBeTruthy());
    sendMessage('close');
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('requests a fresh one-time URL on reload', async () => {
    (openDirectEditingUrl as jest.Mock)
      .mockResolvedValueOnce('https://cloud.example.com/tok1')
      .mockResolvedValueOnce('https://cloud.example.com/tok2');
    render(<AttachmentEditorScreen />, { wrapper });
    await waitFor(() =>
      expect(webviewProps.source).toEqual({ uri: 'https://cloud.example.com/tok1' }),
    );
    sendMessage('reload');
    await waitFor(() =>
      expect(webviewProps.source).toEqual({ uri: 'https://cloud.example.com/tok2' }),
    );
    expect(openDirectEditingUrl).toHaveBeenCalledTimes(2);
  });

  it('loads a pre-minted URL without calling open (create flow)', async () => {
    const { setPendingEditorUrl } = jest.requireActual(
      '../../src/features/event/utils/editorSession',
    );
    setPendingEditorUrl(
      'https://cloud.example.com/apps/files/directEditing/premade',
    );
    render(<AttachmentEditorScreen />, { wrapper });
    await waitFor(() =>
      expect(webviewProps.source).toEqual({
        uri: 'https://cloud.example.com/apps/files/directEditing/premade',
      }),
    );
    expect(openDirectEditingUrl).not.toHaveBeenCalled();
  });

  it('requests a fresh URL when restored without the pending token', async () => {
    // Route params survive state restoration; the consumed one-time URL does
    // not — a restored editor must mint a fresh one via `open`.
    render(<AttachmentEditorScreen />, { wrapper });
    await waitFor(() => expect(webviewProps.source).toBeTruthy());
    expect(openDirectEditingUrl).toHaveBeenCalledWith(
      account,
      '/Calendar/note.txt',
      'text',
    );
  });

  it('shows an error with retry when the open request fails', async () => {
    (openDirectEditingUrl as jest.Mock).mockRejectedValue(new Error('nope'));
    const { findByText } = render(<AttachmentEditorScreen />, { wrapper });
    expect(await findByText('Could not open the editor')).toBeTruthy();
    expect(await findByText('Retry')).toBeTruthy();
  });

  it('creates a public link and shares it on share', async () => {
    const { createPublicLinkShare } = jest.requireMock(
      '../../src/services/nextcloud/shares',
    );
    createPublicLinkShare.mockResolvedValue({
      url: 'https://cloud.example.com/s/tok',
    });
    const shareSpy = jest
      .spyOn(require('react-native').Share, 'share')
      .mockResolvedValue({ action: 'sharedAction' });
    render(<AttachmentEditorScreen />, { wrapper });
    await waitFor(() => expect(webviewProps.source).toBeTruthy());
    sendMessage('share');
    await waitFor(() =>
      expect(shareSpy).toHaveBeenCalledWith({
        message: 'https://cloud.example.com/s/tok',
      }),
    );
    expect(createPublicLinkShare).toHaveBeenCalledWith(account, '/Calendar/note.txt');
  });

  it('downloads via downloadAndShare on downloadAs', async () => {
    const { downloadAndShare } = jest.requireMock(
      '../../src/features/event/utils/attachments',
    );
    render(<AttachmentEditorScreen />, { wrapper });
    await waitFor(() => expect(webviewProps.source).toBeTruthy());
    sendMessage('downloadAs', {
      URL: '/index.php/apps/richdocuments/export',
      Type: 'application/pdf',
      filename: 'note.pdf',
    });
    await waitFor(() =>
      expect(downloadAndShare).toHaveBeenCalledWith(
        'https://cloud.example.com/index.php/apps/richdocuments/export',
        expect.objectContaining({
          filename: 'note.pdf',
          fmttype: 'application/pdf',
        }),
        expect.stringMatching(/^Basic /),
      ),
    );
  });

  it('opens hyperlinks externally', async () => {
    const linkSpy = jest
      .spyOn(require('react-native').Linking, 'openURL')
      .mockResolvedValue(true);
    render(<AttachmentEditorScreen />, { wrapper });
    await waitFor(() => expect(webviewProps.source).toBeTruthy());
    sendMessage('hyperlink', JSON.stringify({ Url: 'https://example.org/x' }));
    expect(linkSpy).toHaveBeenCalledWith('https://example.org/x');
  });

  it('keeps same-host navigation in the WebView and sends external links out', async () => {
    const linkSpy = jest
      .spyOn(require('react-native').Linking, 'openURL')
      .mockResolvedValue(true);
    render(<AttachmentEditorScreen />, { wrapper });
    await waitFor(() => expect(webviewProps.source).toBeTruthy());
    const guard = webviewProps.onShouldStartLoadWithRequest as (
      r: unknown,
    ) => boolean;
    expect(
      guard({ url: 'https://cloud.example.com/apps/text/something' }),
    ).toBe(true);
    expect(guard({ url: 'https://evil.example.com/' })).toBe(false);
    expect(linkSpy).toHaveBeenCalledWith('https://evil.example.com/');
    expect(guard({ url: 'intent://scan' })).toBe(false);
  });
});
