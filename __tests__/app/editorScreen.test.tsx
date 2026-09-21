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

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useLocalSearchParams: () => ({
    path: '/Calendar/note.txt',
    editorId: 'text',
    name: 'note.txt',
  }),
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
  openDirectEditingUrl: jest.fn(),
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

  it('shows an error with retry when the open request fails', async () => {
    (openDirectEditingUrl as jest.Mock).mockRejectedValue(new Error('nope'));
    const { findByText } = render(<AttachmentEditorScreen />, { wrapper });
    expect(await findByText('Could not open the editor')).toBeTruthy();
    expect(await findByText('Retry')).toBeTruthy();
  });
});
