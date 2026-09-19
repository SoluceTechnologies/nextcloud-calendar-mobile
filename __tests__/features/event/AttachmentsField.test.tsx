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
        onAdd={jest.fn()}
        onRemoveExisting={jest.fn()}
        onRemovePending={jest.fn()}
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
        onAdd={jest.fn()}
        onRemoveExisting={jest.fn()}
        onRemovePending={jest.fn()}
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
        onAdd={onAdd}
        onRemoveExisting={jest.fn()}
        onRemovePending={jest.fn()}
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
        onAdd={jest.fn()}
        onRemoveExisting={onRemoveExisting}
        onRemovePending={onRemovePending}
      />,
      { wrapper },
    );
    const buttons = getAllByLabelText('Remove attachment');
    fireEvent.press(buttons[0]);
    fireEvent.press(buttons[1]);
    expect(onRemoveExisting).toHaveBeenCalledWith(existing[0]);
    expect(onRemovePending).toHaveBeenCalledWith(0);
  });
});
