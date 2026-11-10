import { act, renderHook } from '@testing-library/react-native';

import {
  useCreateEvent,
  useDeleteEvent,
  useUpdateEvent,
} from '@/features/event/hooks/useMutateEvent';
import {
  deleteEvent,
  fetchEventIcs,
  moveEvent,
  putEvent,
  updateEvent,
} from '@/services/nextcloud/caldav';
import type { Account, CalendarEvent, CalendarMeta, CreateEventInput } from '@/types';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-uid' }));
jest.mock('@/services/nextcloud/caldav', () => ({
  putEvent: jest.fn().mockResolvedValue(undefined),
  updateEvent: jest.fn().mockResolvedValue(undefined),
  deleteEvent: jest.fn().mockResolvedValue(undefined),
  moveEvent: jest.fn().mockResolvedValue(undefined),
  fetchEventIcs: jest.fn().mockResolvedValue(
    'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:ev1\r\nSEQUENCE:2\r\nDTSTART:20260105T100000Z\r\nDTEND:20260105T110000Z\r\nEND:VEVENT\r\nEND:VCALENDAR',
  ),
}));
jest.mock('@/services/nextcloud/talk', () => ({ createTalkRoom: jest.fn() }));
jest.mock('@/database/eventWrites', () => ({
  insertEvents: jest.fn().mockResolvedValue(undefined),
  patchByUid: jest.fn().mockResolvedValue(undefined),
  removeWhere: jest.fn().mockResolvedValue([]),
  restoreSeries: jest.fn().mockResolvedValue(undefined),
  snapshotByBase: jest.fn().mockResolvedValue([]),
  shiftSeriesDates: jest.fn().mockResolvedValue(undefined),
  seriesBaseUid: (uid: string) => {
    const i = uid.indexOf('_occ_');
    return i === -1 ? uid : uid.slice(0, i);
  },
}));

const a1 = {
  id: 'a1',
  displayName: 'Alice',
  baseUrl: 'https://one.example.com',
  username: 'alice',
  appPassword: 'p1',
  davUserId: 'alice',
} as Account;
const a2 = {
  id: 'a2',
  displayName: 'Bob',
  baseUrl: 'https://two.example.com',
  username: 'bob',
  appPassword: 'p2',
  davUserId: 'bob',
} as Account;

const calA1 = {
  id: 'cal-a1',
  accountId: 'a1',
  displayName: 'A1 Personal',
  color: '#0082c9',
  ctag: '1',
  url: 'https://one.example.com/dav/calendars/alice/personal/',
  slug: 'personal',
} as CalendarMeta;
const calA2 = {
  id: 'cal-a2',
  accountId: 'a2',
  displayName: 'A2 Work',
  color: '#e9322d',
  ctag: '1',
  url: 'https://two.example.com/dav/calendars/bob/work/',
  slug: 'work',
} as CalendarMeta;

const input: CreateEventInput = {
  summary: 'Lunch',
  calendarId: 'cal-a1',
  dtstart: new Date(2026, 0, 5, 10),
  dtend: new Date(2026, 0, 5, 11),
  allDay: false,
  attendees: [],
  withTalkRoom: false,
  organizerEmail: 'alice@one.example.com',
  organizerName: 'Alice',
};

const baseEvent: CalendarEvent = {
  uid: 'ev1',
  href: 'https://one.example.com/dav/calendars/alice/personal/ev1.ics',
  calendarId: 'cal-a1',
  accountId: 'a1',
  summary: 'Lunch',
  dtstart: new Date(2026, 0, 5, 10),
  dtend: new Date(2026, 0, 5, 11),
  allDay: false,
  color: '#0082c9',
  attendees: [],
  isRecurring: false,
};

beforeEach(() => jest.clearAllMocks());

describe('useCreateEvent', () => {
  it('writes to the account owning the selected calendar', async () => {
    const { result } = renderHook(() => useCreateEvent([a1, a2], [calA1, calA2]));
    await act(() => result.current.mutateAsync({ ...input, calendarId: 'cal-a2' }));
    expect((putEvent as jest.Mock).mock.calls[0][0].id).toBe('a2');
    expect((putEvent as jest.Mock).mock.calls[0][1].id).toBe('cal-a2');
  });
});

describe('useUpdateEvent', () => {
  it("resolves the source account from the event's accountId", async () => {
    const { result } = renderHook(() => useUpdateEvent([a1, a2], [calA1, calA2]));
    const event = { ...baseEvent, accountId: 'a2', calendarId: 'cal-a2' };
    await act(() => result.current.mutateAsync({ event, input: { ...input, calendarId: 'cal-a2' } }));
    expect((updateEvent as jest.Mock).mock.calls[0][0].id).toBe('a2');
  });

  it('uses CalDAV MOVE for a same-account calendar change', async () => {
    const otherCalA1 = { ...calA1, id: 'cal-a1-bis' } as CalendarMeta;
    const { result } = renderHook(() => useUpdateEvent([a1, a2], [calA1, otherCalA1, calA2]));
    await act(() =>
      result.current.mutateAsync({ event: baseEvent, input: { ...input, calendarId: 'cal-a1-bis' } }),
    );
    expect(moveEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a1' }),
      baseEvent.href,
      expect.objectContaining({ id: 'cal-a1-bis' }),
      baseEvent.uid,
    );
    expect(putEvent).not.toHaveBeenCalled();
  });

  it('put+delete across accounts instead of CalDAV MOVE', async () => {
    const { result } = renderHook(() => useUpdateEvent([a1, a2], [calA1, calA2]));
    await act(() =>
      result.current.mutateAsync({ event: baseEvent, input: { ...input, calendarId: 'cal-a2' } }),
    );
    expect((putEvent as jest.Mock).mock.calls[0][0].id).toBe('a2');
    expect((putEvent as jest.Mock).mock.calls[0][1].id).toBe('cal-a2');
    expect(deleteEvent).toHaveBeenCalledWith(a1, baseEvent.href);
    expect(moveEvent).not.toHaveBeenCalled();
  });
});

describe('useDeleteEvent', () => {
  it("resolves the account from the event's accountId", async () => {
    const { result } = renderHook(() => useDeleteEvent([a1, a2]));
    await act(() => result.current.mutateAsync({ event: { ...baseEvent, accountId: 'a2' } }));
    expect((deleteEvent as jest.Mock).mock.calls[0][0].id).toBe('a2');
  });
});
