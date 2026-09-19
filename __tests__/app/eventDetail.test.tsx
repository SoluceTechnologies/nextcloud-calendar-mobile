import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from 'expo-router';
import { lightTheme } from '../../src/theme';
import EventDetailScreen from '../../app/event/[uid]';
import { openAttachment } from '../../src/features/event/utils/attachments';
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

jest.mock('../../src/hooks/useCalendars', () => ({
  useCalendars: () => ({ data: [calendar], isFetching: false }),
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
    await i18n.changeLanguage('en');
    useAccountStore.setState({ activeAccountId: 'acc-1' });
  });

  it('does not render the attachments section when the event has none', () => {
    mockEvent = event();
    const { queryByText } = render(<EventDetailScreen />, { wrapper });
    expect(queryByText('Attachments')).toBeNull();
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
});
