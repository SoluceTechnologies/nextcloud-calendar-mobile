import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { lightTheme } from '../../../src/theme';
import { AttachmentsField } from '../../../src/features/event/components/AttachmentsField';
import i18n from '../../../src/utils/i18n';
import type { EventAttachment, PendingAttachment } from '../../../src/types';

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(async () => 'aGk='),
  EncodingType: { Base64: 'base64' },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../src/services/nextcloud/files', () => ({
  listDavFolder: jest.fn(async () => [
    { path: '/Calendar', name: 'Calendar', isDir: true },
    { path: '/report.pdf', name: 'report.pdf', isDir: false, mime: 'application/pdf', size: 99 },
  ]),
  fileDavUrl: (acc: { baseUrl: string; davUserId: string }, path: string) =>
    `${acc.baseUrl}/remote.php/dav/files/${acc.davUserId}${path}`,
}));

const filesAccount = {
  baseUrl: 'https://srv',
  davUserId: 'alice',
  username: 'alice',
  appPassword: 'pw',
};

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ThemeProvider, { value: lightTheme, children });
}

const existing: EventAttachment[] = [
  { uri: 'https://srv/remote.php/dav/files/alice/Calendar/doc.pdf', filename: 'doc.pdf', fmttype: 'application/pdf', size: 2048 },
];

const pending: PendingAttachment[] = [
  { name: 'photo.png', contentBase64: 'aGk=', mimeType: 'image/png', size: 100 },
];

describe('AttachmentsField', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await i18n.changeLanguage('en');
  });

  it('renders existing and pending attachments', () => {
    const { getByText } = render(
      <AttachmentsField
        existing={existing}
        pending={pending}
        remote={[]}
        onAdd={jest.fn()}
        onAddRemote={jest.fn()}
        onRemoveExisting={jest.fn()}
        onRemovePending={jest.fn()}
        onRemoveRemote={jest.fn()}
      />,
      { wrapper },
    );
    expect(getByText('doc.pdf')).toBeTruthy();
    expect(getByText('photo.png')).toBeTruthy();
    expect(getByText(/Will be uploaded when you save/)).toBeTruthy();
  });

  it('shows the empty hint when nothing is attached', () => {
    const { getByText } = render(
      <AttachmentsField
        existing={[]}
        pending={[]}
        remote={[]}
        onAdd={jest.fn()}
        onAddRemote={jest.fn()}
        onRemoveExisting={jest.fn()}
        onRemovePending={jest.fn()}
        onRemoveRemote={jest.fn()}
      />,
      { wrapper },
    );
    expect(getByText('No attachments')).toBeTruthy();
  });

  it('forwards picked files to onAdd', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [
        { uri: 'file:///cache/p.pdf', name: 'p.pdf', size: 10, mimeType: 'application/pdf' },
      ],
    });
    const onAdd = jest.fn();
    const { getByLabelText } = render(
      <AttachmentsField
        existing={[]}
        pending={[]}
        remote={[]}
        onAdd={onAdd}
        onAddRemote={jest.fn()}
        onRemoveExisting={jest.fn()}
        onRemovePending={jest.fn()}
        onRemoveRemote={jest.fn()}
      />,
      { wrapper },
    );
    fireEvent.press(getByLabelText('Add attachment'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({
      name: 'p.pdf', contentBase64: 'aGk=', mimeType: 'application/pdf', size: 10,
    }));
  });

  it('calls back on remove for both existing and pending rows', () => {
    const onRemoveExisting = jest.fn();
    const onRemovePending = jest.fn();
    const { getAllByLabelText } = render(
      <AttachmentsField
        existing={existing}
        pending={pending}
        remote={[]}
        onAdd={jest.fn()}
        onAddRemote={jest.fn()}
        onRemoveExisting={onRemoveExisting}
        onRemovePending={onRemovePending}
        onRemoveRemote={jest.fn()}
      />,
      { wrapper },
    );
    const buttons = getAllByLabelText('Remove attachment');
    fireEvent.press(buttons[0]);
    fireEvent.press(buttons[1]);
    expect(onRemoveExisting).toHaveBeenCalledWith(existing[0]);
    expect(onRemovePending).toHaveBeenCalledWith(0);
  });

  it('offers the Nextcloud source and forwards picked DAV entries to onAddRemote', async () => {
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert');
    const onAddRemote = jest.fn();
    const { getByLabelText, getByText } = render(
      <AttachmentsField
        existing={[]}
        pending={[]}
        remote={[]}
        account={filesAccount}
        onAdd={jest.fn()}
        onAddRemote={onAddRemote}
        onRemoveExisting={jest.fn()}
        onRemovePending={jest.fn()}
        onRemoveRemote={jest.fn()}
      />,
      { wrapper },
    );
    fireEvent.press(getByLabelText('Add attachment'));
    const buttons = alertSpy.mock.calls[0][2] as { text?: string; onPress?: () => void }[];
    const nextcloudBtn = buttons?.find(
      (b) => b.text === 'From Nextcloud files',
    );
    expect(nextcloudBtn).toBeTruthy();
    nextcloudBtn?.onPress?.();
    await waitFor(() => getByText('report.pdf'));
    fireEvent.press(getByText('report.pdf'));
    expect(onAddRemote).toHaveBeenCalledWith({
      uri: 'https://srv/remote.php/dav/files/alice/report.pdf',
      filename: 'report.pdf',
      fmttype: 'application/pdf',
      size: 99,
    });
    alertSpy.mockRestore();
  });
});
