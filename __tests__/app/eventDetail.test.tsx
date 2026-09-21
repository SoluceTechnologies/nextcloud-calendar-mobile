import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { lightTheme } from '../../src/theme';
import EventDetailScreen from '../../app/event/[uid]';
import {
  openAttachment,
  prepareAttachmentEdit,
} from '../../src/features/event/utils/attachments';
import { fetchDirectEditing } from '../../src/services/nextcloud/directEditing';
import { useAccountStore } from '../../src/stores/accountStore';
import i18n from '../../src/utils/i18n';
import type { Account, CalendarEvent, CalendarMeta } from '../../src/types';

const account: Account = {
  id: 'acc-1',
  displayName: 'Alice',
  baseUrl: 'https://cloud.example.com',
  username: 'alice',
  appPassword: 'pw',
  davUserId: 'alice',
};

const calendar: CalendarMeta = {
  id: 'cal-1',
  accountId: 'acc-1',
  displayName: 'Personal',
  color: '#00679e',
  ctag: 'ctag-1',
  url: 'https://cloud.example.com/remote.php/dav/calendars/alice/personal/',
  slug: 'personal',
};

let mockEvent: CalendarEvent | undefined;

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useLocalSearchParams: () => ({ uid: 'e1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useNavigation: () => ({
    getState: () => ({ type: 'stack', routes: [{ name: 'index' }, { name: 'event/[uid]' }] }),
    reset: jest.fn(),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../../src/database/useEventByUid', () => ({
  useEventByUid: () => mockEvent,
}));

jest.mock('../../src/hooks/useAccounts', () => ({
  useAccounts: () => [account],
}));

let mockCalendars: CalendarMeta[] = [calendar];

jest.mock('../../src/hooks/useCalendars', () => ({
  useCalendars: () => ({ data: mockCalendars, isFetching: false }),
}));

jest.mock('../../src/features/event/hooks/useMutateEvent', () => ({
  useDeleteEvent: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('../../src/features/map/hooks/useEventLocation', () => ({
  useEventLocation: () => ({ coordinates: null, isVirtual: false }),
}));

jest.mock('../../src/features/map/components', () => ({
  EventMapPreview: () => null,
  EventMapSheet: () => null,
}));

jest.mock('../../src/features/map/utils/mapLinks', () => ({
  openMaps: jest.fn(),
}));

jest.mock('../../src/features/event/utils/attachments', () => ({
  ...jest.requireActual('../../src/features/event/utils/attachments'),
  openAttachment: jest.fn(),
  prepareAttachmentEdit: jest.fn(async () => null),
}));

const mockAttachments = {
  add: jest.fn(async () => undefined),
  remove: jest.fn(async () => undefined),
  isPending: false,
  ready: true,
};

jest.mock('../../src/features/event/hooks/useEventAttachments', () => ({
  useEventAttachments: () => mockAttachments,
}));

jest.mock('../../src/services/nextcloud/directEditing', () => ({
  ...jest.requireActual('../../src/services/nextcloud/directEditing'),
  fetchDirectEditing: jest.fn(async () => ({ editors: [], creators: [] })),
  createDirectEditingUrl: jest.fn(async () => 'https://cloud.example.com/de/tok'),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(async () => 'aGk='),
  EncodingType: { Base64: 'base64' },
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/utils/haptics', () => ({ haptic: jest.fn() }));

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ThemeProvider, { value: lightTheme, children });
}

function event(partial: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    uid: 'e1',
    href: '/c/e1.ics',
    calendarId: 'cal-1',
    accountId: 'acc-1',
    summary: 'Demo attachments',
    dtstart: new Date('2026-09-19T14:00:00Z'),
    dtend: new Date('2026-09-19T15:00:00Z'),
    allDay: false,
    color: '#00679e',
    attendees: [],
    isRecurring: false,
    ...partial,
  };
}

describe('EventDetailScreen attachments', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockCalendars = [calendar];
    mockAttachments.add.mockClear();
    mockAttachments.remove.mockClear();
    await i18n.changeLanguage('en');
    useAccountStore.setState({ activeAccountId: 'acc-1' });
  });

  it('shows an empty section with an add button on editable events', () => {
    mockEvent = event();
    const { getByText, getByLabelText } = render(<EventDetailScreen />, { wrapper });
    expect(getByText('Attachments')).toBeTruthy();
    expect(getByLabelText('Add attachment')).toBeTruthy();
  });

  it('hides the section entirely on read-only calendars', () => {
    mockCalendars = [{ ...calendar, isReadOnly: true }];
    mockEvent = event();
    const { queryByText } = render(<EventDetailScreen />, { wrapper });
    expect(queryByText('Attachments')).toBeNull();
  });

  it('hides the add button on read-only calendars with attachments', () => {
    mockCalendars = [{ ...calendar, isReadOnly: true }];
    mockEvent = event({
      attachments: [{ uri: 'https://cloud.example.com/f.pdf', filename: 'doc.pdf' }],
    });
    const { getByText, queryByLabelText } = render(<EventDetailScreen />, { wrapper });
    expect(getByText('doc.pdf')).toBeTruthy();
    expect(queryByLabelText('Add attachment')).toBeNull();
    expect(queryByLabelText('Remove attachment')).toBeNull();
  });

  it('lists each attachment with its filename, MIME type and size', () => {
    mockEvent = event({
      attachments: [
        {
          uri: 'https://cloud.example.com/f.pdf',
          filename: 'doc.pdf',
          fmttype: 'application/pdf',
          size: 2048,
        },
        { base64: 'aGk=', filename: 'note.txt', fmttype: 'text/plain' },
      ],
    });
    const { getByText } = render(<EventDetailScreen />, { wrapper });
    expect(getByText('Attachments')).toBeTruthy();
    expect(getByText('doc.pdf')).toBeTruthy();
    expect(getByText('application/pdf · 2.0 KB')).toBeTruthy();
    expect(getByText('note.txt')).toBeTruthy();
    expect(getByText('text/plain')).toBeTruthy();
  });

  it('uses the untitled fallback when an attachment has no filename', () => {
    mockEvent = event({ attachments: [{ base64: 'aGk=' }] });
    const { getByText } = render(<EventDetailScreen />, { wrapper });
    expect(getByText('Attachment')).toBeTruthy();
  });

  it('opens the attachment through openAttachment on tap', () => {
    const att = {
      uri: 'https://cloud.example.com/f.pdf',
      filename: 'doc.pdf',
      fmttype: 'application/pdf',
    };
    mockEvent = event({ attachments: [att] });
    const { getByText } = render(<EventDetailScreen />, { wrapper });
    fireEvent.press(getByText('doc.pdf'));
    expect(openAttachment).toHaveBeenCalledWith(att, account, '/c/e1.ics');
  });

  it('uploads the picked document through attachments.add', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [
        { uri: 'file:///cache/doc.pdf', name: 'doc.pdf', size: 2048, mimeType: 'application/pdf' },
      ],
    });
    mockEvent = event();
    const { getByLabelText, getByText } = render(<EventDetailScreen />, { wrapper });
    fireEvent.press(getByLabelText('Add attachment'));
    fireEvent.press(getByText('From this device'));
    await waitFor(() => expect(mockAttachments.add).toHaveBeenCalled());
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith('file:///cache/doc.pdf', {
      encoding: 'base64',
    });
    expect(mockAttachments.add).toHaveBeenCalledWith({
      name: 'doc.pdf',
      contentBase64: 'aGk=',
      mimeType: 'application/pdf',
      size: 2048,
    });
  });

  it('does nothing when the picker is cancelled', async () => {
    mockEvent = event();
    const { getByLabelText, getByText } = render(<EventDetailScreen />, { wrapper });
    fireEvent.press(getByLabelText('Add attachment'));
    fireEvent.press(getByText('From this device'));
    await Promise.resolve();
    expect(mockAttachments.add).not.toHaveBeenCalled();
  });

  it('asks for confirmation before removing an attachment', () => {
    const att = { uri: 'https://cloud.example.com/f.pdf', filename: 'doc.pdf' };
    mockEvent = event({ attachments: [att] });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByLabelText } = render(<EventDetailScreen />, { wrapper });
    fireEvent.press(getByLabelText('Remove attachment'));
    expect(alertSpy).toHaveBeenCalled();
    const buttons = alertSpy.mock.calls[0][2] ?? [];
    expect(buttons.find((b) => b.text === 'Remove and delete file')).toBeUndefined();
    const confirm = buttons.find((b) => b.style === 'destructive');
    confirm?.onPress?.();
    expect(mockAttachments.remove).toHaveBeenCalledWith(att);
  });

  it('offers file deletion for attachments inside the account DAV space', () => {
    const att = {
      uri: 'https://cloud.example.com/remote.php/dav/files/alice/Calendar/doc.pdf',
      filename: 'doc.pdf',
    };
    mockEvent = event({ attachments: [att] });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByLabelText } = render(<EventDetailScreen />, { wrapper });
    fireEvent.press(getByLabelText('Remove attachment'));
    const buttons = alertSpy.mock.calls[0][2] ?? [];
    const destructive = buttons.find((b) => b.style === 'destructive');
    expect(destructive?.text).toBe('Remove and delete file');
    destructive?.onPress?.();
    expect(mockAttachments.remove).toHaveBeenCalledWith(att, { deleteFile: true });
  });

  it('shows an edit button for own files covered by a direct editor', async () => {
    (fetchDirectEditing as jest.Mock).mockResolvedValue({ creators: [], editors: [
      { id: 'text', name: 'Text', mimetypes: ['text/plain'], optionalMimetypes: [] },
    ] });
    const att = {
      uri: 'https://cloud.example.com/remote.php/dav/files/alice/Calendar/note.txt',
      filename: 'note.txt',
      fmttype: 'text/plain',
    };
    mockEvent = event({ attachments: [att] });
    const { findByLabelText } = render(<EventDetailScreen />, { wrapper });
    const editBtn = await findByLabelText('Edit attachment');
    fireEvent.press(editBtn);
    expect(prepareAttachmentEdit).toHaveBeenCalledWith(att, account);
  });

  it('opens the editor when tapping an editable attachment row', async () => {
    (fetchDirectEditing as jest.Mock).mockResolvedValue({ creators: [], editors: [
      { id: 'text', name: 'Text', mimetypes: ['text/plain'], optionalMimetypes: [] },
    ] });
    (prepareAttachmentEdit as jest.Mock).mockResolvedValue({
      path: '/Calendar/note.txt',
      editorId: 'text',
      name: 'note.txt',
    });
    const att = {
      uri: 'https://cloud.example.com/remote.php/dav/files/alice/Calendar/note.txt',
      filename: 'note.txt',
      fmttype: 'text/plain',
    };
    mockEvent = event({ attachments: [att] });
    const { findByText } = render(<EventDetailScreen />, { wrapper });
    fireEvent.press(await findByText('note.txt'));
    await waitFor(() =>
      expect(prepareAttachmentEdit).toHaveBeenCalledWith(att, account),
    );
    expect(openAttachment).not.toHaveBeenCalledWith(att, account, '/c/e1.ics');
  });

  it('hides the edit button when no editor matches the MIME type', async () => {
    (fetchDirectEditing as jest.Mock).mockResolvedValue({ creators: [], editors: [
      { id: 'text', name: 'Text', mimetypes: ['text/plain'], optionalMimetypes: [] },
    ] });
    mockEvent = event({
      attachments: [
        {
          uri: 'https://cloud.example.com/remote.php/dav/files/alice/big.zip',
          filename: 'big.zip',
          fmttype: 'application/zip',
        },
      ],
    });
    const { queryByLabelText, findByText } = render(<EventDetailScreen />, {
      wrapper,
    });
    await findByText('big.zip');
    expect(queryByLabelText('Edit attachment')).toBeNull();
  });
});
